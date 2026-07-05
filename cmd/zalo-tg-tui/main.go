package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	glowutils "github.com/charmbracelet/glow/utils"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

type activityEvent struct {
	Time    string `json:"time"`
	Label   string `json:"label"`
	Message string `json:"message"`
	Tone    string `json:"tone"`
}

type serviceState struct {
	Bridge   string          `json:"bridge"`
	Telegram string          `json:"telegram"`
	Zalo     string          `json:"zalo"`
	Users    int             `json:"users"`
	Topics   int             `json:"topics"`
	Version  string          `json:"version"`
	Phase    string          `json:"phase"`
	Events   []activityEvent `json:"events"`
}

type envelope struct {
	Type   string         `json:"type"`
	State  serviceState   `json:"state"`
	Event  *activityEvent `json:"event,omitempty"`
	Reason string         `json:"reason,omitempty"`
}

type envelopeMsg envelope
type eofMsg struct{}
type readErrMsg struct{ err error }
type quitAfterShutdownMsg struct{}
type tickMsg time.Time
type clearFlashMsg struct{}
type clearClipboardMsg struct{}
type clipboardWriteMsg struct{ method string }

type pane string

const (
	paneActivity pane = "activity"
	paneDocs     pane = "docs"
)

type model struct {
	scanner *bufio.Scanner
	state   serviceState
	width   int
	height  int

	activity viewport.Model
	docs     viewport.Model
	help     help.Model
	spinner  spinner.Model
	progress progress.Model
	keys     keyMap

	focus       pane
	showDocs    bool
	selectMode  bool
	mouse       bool
	selection   selectionState
	frozenView  string
	clipboard   string
	flash       string
	quitting    bool
	err         error
	rows        []activityRow
	markdownFor map[int]string
}

type activityRow struct {
	rendered string
	plain    string
}

type selectionState struct {
	active bool
	has    bool
	anchor int
	cursor int
}

type keyMap struct {
	Up       key.Binding
	Down     key.Binding
	PageUp   key.Binding
	PageDown key.Binding
	Top      key.Binding
	Bottom   key.Binding
	Docs     key.Binding
	Help     key.Binding
	Focus    key.Binding
	Select   key.Binding
	Copy     key.Binding
	Clear    key.Binding
	Quit     key.Binding
}

func newKeyMap() keyMap {
	return keyMap{
		Up:       key.NewBinding(key.WithKeys("up", "k"), key.WithHelp("↑/k", "up")),
		Down:     key.NewBinding(key.WithKeys("down", "j"), key.WithHelp("↓/j", "down")),
		PageUp:   key.NewBinding(key.WithKeys("pgup", "u"), key.WithHelp("pgup/u", "page up")),
		PageDown: key.NewBinding(key.WithKeys("pgdown", "d"), key.WithHelp("pgdn/d", "page down")),
		Top:      key.NewBinding(key.WithKeys("home", "g"), key.WithHelp("g/home", "oldest")),
		Bottom:   key.NewBinding(key.WithKeys("end", "G"), key.WithHelp("G/end", "live")),
		Docs:     key.NewBinding(key.WithKeys("?", "h"), key.WithHelp("?/h", "glow help")),
		Help:     key.NewBinding(key.WithKeys("f1"), key.WithHelp("f1", "all keys")),
		Focus:    key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "focus")),
		Select:   key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "select/copy")),
		Copy:     key.NewBinding(key.WithKeys("y", "ctrl+y", "ctrl+c"), key.WithHelp("y/^y", "copy")),
		Clear:    key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "clear")),
		Quit:     key.NewBinding(key.WithKeys("ctrl+c"), key.WithHelp("ctrl+c", "stop")),
	}
}

func (k keyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Up, k.Down, k.PageUp, k.PageDown, k.Select, k.Docs, k.Quit}
}

func (k keyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down, k.PageUp, k.PageDown},
		{k.Top, k.Bottom, k.Focus, k.Select},
		{k.Copy, k.Clear, k.Docs, k.Help, k.Quit},
	}
}

type palette struct {
	ink      lipgloss.Color
	muted    lipgloss.Color
	panel    lipgloss.Color
	border   lipgloss.Color
	magenta  lipgloss.Color
	cyan     lipgloss.Color
	green    lipgloss.Color
	yellow   lipgloss.Color
	red      lipgloss.Color
	blue     lipgloss.Color
	shadow   lipgloss.Color
	terminal lipgloss.AdaptiveColor
}

type designSystem struct {
	palette palette

	app       lipgloss.Style
	topBar    lipgloss.Style
	status    lipgloss.Style
	panel     lipgloss.Style
	active    lipgloss.Style
	card      lipgloss.Style
	cardTitle lipgloss.Style
	footer    lipgloss.Style
	pill      lipgloss.Style
	brand     lipgloss.Style
	muted     lipgloss.Style
}

func newDesignSystem() designSystem {
	p := palette{
		ink:      lipgloss.Color("#DADDE3"),
		muted:    lipgloss.Color("#6E7681"),
		panel:    lipgloss.Color("#0F1115"),
		border:   lipgloss.Color("#30363D"),
		magenta:  lipgloss.Color("#BC8CFF"),
		cyan:     lipgloss.Color("#58A6FF"),
		green:    lipgloss.Color("#3FB950"),
		yellow:   lipgloss.Color("#D29922"),
		red:      lipgloss.Color("#F85149"),
		blue:     lipgloss.Color("#79C0FF"),
		shadow:   lipgloss.Color("#010409"),
		terminal: lipgloss.AdaptiveColor{Light: "#24292F", Dark: "#DADDE3"},
	}
	return designSystem{
		palette: p,
		app: lipgloss.NewStyle().
			Foreground(p.terminal).
			Padding(0, 1),
		topBar: lipgloss.NewStyle().
			Foreground(p.ink).
			Padding(0, 0),
		status: lipgloss.NewStyle().
			Foreground(p.muted).
			Padding(0, 0),
		panel: lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(p.border).
			Padding(0, 1),
		active: lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(p.cyan).
			Padding(0, 1),
		card: lipgloss.NewStyle().
			Foreground(p.ink).
			Padding(0, 1),
		cardTitle: lipgloss.NewStyle().
			Foreground(p.muted).
			Bold(false),
		footer: lipgloss.NewStyle().
			Foreground(p.muted),
		pill: lipgloss.NewStyle().
			Foreground(p.ink).
			Bold(true).
			Padding(0, 1),
		brand: lipgloss.NewStyle().
			Bold(true),
		muted: lipgloss.NewStyle().
			Foreground(p.muted),
	}
}

var ui = newDesignSystem()
var startedAt = time.Now()

func main() {
	reader, readFromStdin, err := eventReader()
	if err != nil {
		fmt.Fprintln(os.Stderr, "zalo-tg-tui:", err)
		os.Exit(1)
	}

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	keys := newKeyMap()
	h := help.New()
	h.ShowAll = false
	h.Styles.ShortKey = h.Styles.ShortKey.Foreground(ui.palette.cyan).Bold(true)
	h.Styles.ShortDesc = h.Styles.ShortDesc.Foreground(ui.palette.muted)
	h.Styles.FullKey = h.Styles.FullKey.Foreground(ui.palette.cyan).Bold(true)
	h.Styles.FullDesc = h.Styles.FullDesc.Foreground(ui.palette.ink)

	activity := viewport.New(0, 0)
	activity.MouseWheelEnabled = true
	activity.MouseWheelDelta = 2
	activity.KeyMap = viewport.DefaultKeyMap()

	docs := viewport.New(0, 0)
	docs.MouseWheelEnabled = true
	docs.MouseWheelDelta = 2

	spin := spinner.New(
		spinner.WithSpinner(spinner.MiniDot),
		spinner.WithStyle(lipgloss.NewStyle().Foreground(ui.palette.cyan)),
	)
	bar := progress.New(
		progress.WithoutPercentage(),
		progress.WithSolidFill(string(ui.palette.cyan)),
		progress.WithFillCharacters('━', '─'),
		progress.WithWidth(12),
	)

	m := model{
		scanner: scanner,
		state: serviceState{
			Bridge:   "starting",
			Telegram: "waiting",
			Zalo:     "waiting",
			Version:  "1.0.0",
			Phase:    "STARTUP",
		},
		activity:    activity,
		docs:        docs,
		help:        h,
		spinner:     spin,
		progress:    bar,
		keys:        keys,
		focus:       paneActivity,
		mouse:       mouseCaptureEnabled(),
		markdownFor: map[int]string{},
	}

	options := []tea.ProgramOption{
		tea.WithAltScreen(),
	}
	if m.mouse {
		options = append(options, tea.WithMouseCellMotion())
	}
	if readFromStdin {
		// In pipe-smoke mode stdin is the event stream, so Bubble Tea must not
		// also consume it as keyboard input.
		options = append(options, tea.WithInput(nil))
	}

	if _, err := tea.NewProgram(m, options...).Run(); err != nil {
		fmt.Fprintln(os.Stderr, "zalo-tg-tui:", err)
		os.Exit(1)
	}
}

func eventReader() (io.Reader, bool, error) {
	if file := os.NewFile(uintptr(3), "zalo-tg-events"); file != nil {
		if _, err := file.Stat(); err == nil {
			return file, false, nil
		}
		_ = file.Close()
	}
	if stat, err := os.Stdin.Stat(); err == nil && (stat.Mode()&os.ModeCharDevice) == 0 {
		return os.Stdin, true, nil
	}
	return nil, false, errors.New("missing event stream on fd 3")
}

func (m model) Init() tea.Cmd {
	return tea.Batch(readNext(m.scanner), tick(), m.spinner.Tick)
}

func readNext(scanner *bufio.Scanner) tea.Cmd {
	return func() tea.Msg {
		if scanner.Scan() {
			var env envelope
			if err := json.Unmarshal(scanner.Bytes(), &env); err != nil {
				return readErrMsg{err: err}
			}
			return envelopeMsg(env)
		}
		if err := scanner.Err(); err != nil {
			return readErrMsg{err: err}
		}
		return eofMsg{}
	}
}

func tick() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func emit(msg tea.Msg) tea.Cmd {
	return func() tea.Msg { return msg }
}

func mouseCaptureEnabled() bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv("ZALO_TG_TUI_MOUSE")))
	switch value {
	case "0", "false", "off", "no", "native":
		return false
	default:
		return true
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.layout()
		return m, nil

	case tea.KeyMsg:
		switch {
		case m.selection.has && key.Matches(msg, m.keys.Copy):
			return m, m.copySelection()
		case m.selection.has && key.Matches(msg, m.keys.Clear):
			m.selection = selectionState{}
			m.flash = ""
			m.layout()
			return m, nil
		case key.Matches(msg, m.keys.Quit):
			signalParent()
			return m, tea.Quit
		case key.Matches(msg, m.keys.Select):
			m.selectMode = !m.selectMode
			if m.selectMode {
				m.frozenView = m.renderFrame()
				if m.mouse {
					return m, emit(tea.DisableMouse())
				}
				return m, nil
			}
			m.frozenView = ""
			m.layout()
			if m.mouse {
				return m, tea.Batch(emit(tea.EnableMouseCellMotion()), tick())
			}
			return m, tick()
		case key.Matches(msg, m.keys.Docs):
			if m.selectMode {
				return m, nil
			}
			m.showDocs = !m.showDocs
			if !m.showDocs {
				m.focus = paneActivity
			} else {
				m.focus = paneDocs
			}
			m.layout()
			return m, nil
		case key.Matches(msg, m.keys.Help):
			if m.selectMode {
				return m, nil
			}
			m.help.ShowAll = !m.help.ShowAll
			m.layout()
			return m, nil
		case key.Matches(msg, m.keys.Focus):
			if m.selectMode {
				return m, nil
			}
			if m.showDocs && m.focus == paneActivity {
				m.focus = paneDocs
			} else {
				m.focus = paneActivity
			}
			return m, nil
		case key.Matches(msg, m.keys.Top):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().GotoTop()
			return m, nil
		case key.Matches(msg, m.keys.Bottom):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().GotoBottom()
			return m, nil
		case key.Matches(msg, m.keys.Up):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().ScrollUp(1)
			return m, nil
		case key.Matches(msg, m.keys.Down):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().ScrollDown(1)
			return m, nil
		case key.Matches(msg, m.keys.PageUp):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().PageUp()
			return m, nil
		case key.Matches(msg, m.keys.PageDown):
			if m.selectMode {
				return m, nil
			}
			m.focusedViewport().PageDown()
			return m, nil
		}
		m.updateFocusedViewport(msg, &cmds)

	case tea.MouseMsg:
		if m.selectMode {
			return m, nil
		}
		switch msg.Type {
		case tea.MouseWheelUp:
			m.focusedViewport().ScrollUp(3)
			m.layout()
			return m, nil
		case tea.MouseWheelDown:
			m.focusedViewport().ScrollDown(3)
			m.layout()
			return m, nil
		}
		if handled, cmd := m.handleActivitySelection(msg); handled {
			return m, cmd
		}
		m.updateFocusedViewport(msg, &cmds)

	case envelopeMsg:
		env := envelope(msg)
		wasLive := m.activity.AtBottom() || m.activity.TotalLineCount() == 0
		if env.State.Version != "" || env.State.Phase != "" || env.Event != nil {
			m.state = env.State
		}
		if env.Event != nil && len(m.state.Events) == 0 {
			m.state.Events = append(m.state.Events, *env.Event)
		}
		if !m.selectMode {
			m.layout()
			if wasLive {
				m.activity.GotoBottom()
			}
		}
		if env.Type == "shutdown" || env.Type == "quit" {
			m.quitting = true
			m.layout()
			return m, tea.Tick(850*time.Millisecond, func(time.Time) tea.Msg {
				return quitAfterShutdownMsg{}
			})
		}
		return m, readNext(m.scanner)

	case readErrMsg:
		m.err = msg.err
		m.layout()
		return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg {
			return quitAfterShutdownMsg{}
		})

	case eofMsg:
		m.quitting = true
		m.layout()
		return m, tea.Tick(350*time.Millisecond, func(time.Time) tea.Msg {
			return quitAfterShutdownMsg{}
		})

	case quitAfterShutdownMsg:
		return m, tea.Quit

	case tickMsg:
		if m.selectMode {
			// Selection mode intentionally freezes the terminal frame so native
			// drag selection is not invalidated by a clock/update redraw.
			return m, nil
		}
		return m, tick()

	case spinner.TickMsg:
		if m.selectMode {
			return m, nil
		}
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case clearFlashMsg:
		m.flash = ""
		return m, nil

	case clearClipboardMsg:
		m.clipboard = ""
		return m, nil

	case clipboardWriteMsg:
		if msg.method != "" && strings.HasPrefix(m.flash, "copied ") {
			m.flash += " to clipboard"
		}
		return m, nil
	}

	return m, tea.Batch(cmds...)
}

func (m *model) updateFocusedViewport(msg tea.Msg, cmds *[]tea.Cmd) {
	if m.showDocs && m.focus == paneDocs {
		var cmd tea.Cmd
		m.docs, cmd = m.docs.Update(msg)
		*cmds = append(*cmds, cmd)
		return
	}
	var cmd tea.Cmd
	m.activity, cmd = m.activity.Update(msg)
	*cmds = append(*cmds, cmd)
}

func (m *model) handleActivitySelection(msg tea.MouseMsg) (bool, tea.Cmd) {
	if !m.mouse || m.showDocs && min(150, max(56, m.width-2)) < 104 {
		return false, nil
	}

	switch {
	case msg.Button == tea.MouseButtonLeft && msg.Action == tea.MouseActionPress:
		row, ok := m.activityRowFromMouse(msg.Y, false)
		if !ok {
			return false, nil
		}
		m.focus = paneActivity
		m.selection = selectionState{active: true, has: true, anchor: row, cursor: row}
		m.layout()
		return true, nil

	case msg.Button == tea.MouseButtonLeft && msg.Action == tea.MouseActionMotion:
		if !m.selection.active {
			return false, nil
		}
		row, ok := m.activityRowFromMouse(msg.Y, true)
		if !ok {
			return true, nil
		}
		m.selection.cursor = row
		m.layout()
		return true, nil

	case msg.Action == tea.MouseActionRelease:
		if !m.selection.active {
			return false, nil
		}
		m.selection.active = false
		m.layout()
		return true, m.copySelection()

	case msg.Button == tea.MouseButtonRight && msg.Action == tea.MouseActionPress:
		if !m.selection.has {
			return false, nil
		}
		return true, m.copySelection()
	}

	return false, nil
}

func (m *model) activityRowFromMouse(y int, allowAutoscroll bool) (int, bool) {
	if len(m.rows) == 0 {
		return 0, false
	}
	top := activityViewportTop()
	bottom := top + m.activity.Height
	if y < top {
		if allowAutoscroll {
			m.activity.ScrollUp(1)
			return clamp(m.activity.YOffset, 0, len(m.rows)-1), true
		}
		return 0, false
	}
	if y >= bottom {
		if allowAutoscroll {
			m.activity.ScrollDown(1)
			return clamp(m.activity.YOffset+m.activity.Height-1, 0, len(m.rows)-1), true
		}
		return 0, false
	}
	return clamp(m.activity.YOffset+y-top, 0, len(m.rows)-1), true
}

func activityViewportTop() int {
	// topbar + statusbar + panel border + panel title
	return 4
}

func (m selectionState) bounds(maxRows int) (int, int, bool) {
	if !m.has || maxRows <= 0 {
		return 0, 0, false
	}
	start, end := m.anchor, m.cursor
	if start > end {
		start, end = end, start
	}
	return clamp(start, 0, maxRows-1), clamp(end, 0, maxRows-1), true
}

func (m model) rowSelected(index int) bool {
	start, end, ok := m.selection.bounds(len(m.rows))
	return ok && index >= start && index <= end
}

func (m model) selectedText() string {
	start, end, ok := m.selection.bounds(len(m.rows))
	if !ok {
		return ""
	}
	lines := make([]string, 0, end-start+1)
	for i := start; i <= end; i++ {
		if text := strings.TrimSpace(m.rows[i].plain); text != "" {
			lines = append(lines, text)
		}
	}
	return strings.Join(lines, "\n")
}

func (m *model) copySelection() tea.Cmd {
	text := m.selectedText()
	if strings.TrimSpace(text) == "" {
		m.flash = "nothing selected"
		return tea.Tick(1200*time.Millisecond, func(time.Time) tea.Msg { return clearFlashMsg{} })
	}
	m.selection = selectionState{}
	m.clipboard = ansi.SetSystemClipboard(text)
	lines := strings.Count(text, "\n") + 1
	m.flash = fmt.Sprintf("copied %d line%s", lines, plural(lines))
	m.layout()
	return tea.Batch(
		copyToSystemClipboard(text),
		tea.Tick(80*time.Millisecond, func(time.Time) tea.Msg { return clearClipboardMsg{} }),
		tea.Tick(1500*time.Millisecond, func(time.Time) tea.Msg { return clearFlashMsg{} }),
	)
}

func copyToSystemClipboard(text string) tea.Cmd {
	return func() tea.Msg {
		for _, candidate := range [][]string{
			{"pbcopy"},
			{"wl-copy"},
			{"xclip", "-selection", "clipboard"},
		} {
			path, err := exec.LookPath(candidate[0])
			if err != nil {
				continue
			}
			cmd := exec.Command(path, candidate[1:]...)
			cmd.Stdin = strings.NewReader(text)
			if err := cmd.Run(); err == nil {
				return clipboardWriteMsg{method: candidate[0]}
			}
		}
		return clipboardWriteMsg{}
	}
}

func (m *model) focusedViewport() *viewport.Model {
	if m.showDocs && m.focus == paneDocs {
		return &m.docs
	}
	return &m.activity
}

func (m *model) layout() {
	if m.width <= 0 {
		m.width = 100
	}
	if m.height <= 0 {
		m.height = 30
	}

	contentWidth := min(150, max(56, m.width-2))
	footerHeight := 1
	if m.help.ShowAll {
		footerHeight = 3
	}
	topHeight := 1
	statusHeight := 1
	panelFrameHeight := 2
	paneHeight := max(3, m.height-topHeight-statusHeight-footerHeight-panelFrameHeight-1)

	docsWidth := 0
	mainWidth := contentWidth
	if m.showDocs && contentWidth >= 104 {
		docsWidth = clamp(contentWidth/3, 34, 52)
		mainWidth = contentWidth - docsWidth - 2
	}

	m.activity.Width = max(24, mainWidth-4)
	m.activity.Height = paneHeight
	m.rows = m.buildActivityRows(m.activity.Width)
	m.activity.SetContent(renderActivityRows(m.rows))
	if m.activity.PastBottom() {
		m.activity.GotoBottom()
	}
	if len(m.rows) > 0 && m.selection.has {
		m.selection.anchor = clamp(m.selection.anchor, 0, len(m.rows)-1)
		m.selection.cursor = clamp(m.selection.cursor, 0, len(m.rows)-1)
	}

	if docsWidth > 0 {
		m.docs.Width = max(24, docsWidth-4)
		m.docs.Height = paneHeight
		m.docs.SetContent(m.markdownContent(m.docs.Width))
		if m.docs.PastBottom() {
			m.docs.GotoBottom()
		}
	}

	m.help.Width = contentWidth
}

func (m model) View() string {
	if m.selectMode && m.frozenView != "" {
		return m.clipboard + m.frozenView
	}
	return m.clipboard + m.renderFrame()
}

func (m model) renderFrame() string {
	width := m.width
	height := m.height
	if width <= 0 {
		width = 100
	}
	if height <= 0 {
		height = 30
	}
	if width < 56 || height < 14 {
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center,
			ui.muted.Render("Resize terminal to at least 56 × 14"),
		)
	}

	contentWidth := min(150, max(56, width-2))
	top := m.renderTopBar(contentWidth)
	status := m.renderStatusBar(contentWidth)
	footer := m.renderFooter(contentWidth)

	mainPanel := m.panel("activity", paneActivity, m.activity.Width+4, m.activity.Height+2, m.activity.View())
	panels := mainPanel

	if m.showDocs && contentWidth >= 104 {
		docsPanel := m.panel("help", paneDocs, m.docs.Width+4, m.docs.Height+2, m.docs.View())
		panels = lipgloss.JoinHorizontal(lipgloss.Top, mainPanel, "  ", docsPanel)
	} else if m.showDocs {
		// Narrow terminals get a modal-like markdown view instead of a cramped
		// split. It feels intentional rather than like a broken responsive state.
		panels = m.panel("help", paneDocs, contentWidth, height-5, m.markdownContent(contentWidth-4))
	}

	body := lipgloss.JoinVertical(lipgloss.Left, top, status, panels, footer)
	return ui.app.Width(width).Render(lipgloss.PlaceHorizontal(width-2, lipgloss.Center, body))
}

func (m model) renderTopBar(width int) string {
	pulse := m.spinner.View()
	if m.state.Bridge == "online" && m.state.Telegram == "online" && m.state.Zalo == "online" {
		pulse = "●"
	}
	left := lipgloss.NewStyle().Foreground(statusColor(m.state.Bridge)).Render(pulse) +
		" " + ui.brand.Render("zalo-tg") + ui.muted.Render(" / bridge")
	phase := strings.ToLower(defaultString(m.state.Phase, "startup"))
	right := ui.muted.Render(fmt.Sprintf("v%s  %s  up %s", defaultString(m.state.Version, "1.0.0"), time.Now().Format("15:04:05"), uptime()))
	if width < 96 {
		right = ui.muted.Render("up " + uptime())
	}
	return ui.topBar.Width(width).Render(alignLine(width, left+ui.muted.Render("  "+phase), right))
}

func (m model) renderStatusBar(width int) string {
	separator := ui.muted.Render("   ")
	left := lipgloss.JoinHorizontal(lipgloss.Left,
		m.statusSegment("bridge", m.state.Bridge),
		separator,
		m.statusSegment("telegram", m.state.Telegram),
		separator,
		m.statusSegment("zalo", m.state.Zalo),
	)
	rightParts := []string{fmt.Sprintf("%d topics", m.state.Topics), fmt.Sprintf("%d users", m.state.Users)}
	if m.activity.TotalLineCount() > m.activity.Height {
		rightParts = append([]string{m.scrollMeter(12)}, rightParts...)
	}
	right := ui.muted.Render(strings.Join(rightParts, "  "))
	if width < 92 {
		right = ""
	}
	return ui.status.Width(width).Render(alignLine(width, left, right))
}

func (m model) statusSegment(name, value string) string {
	color := statusColor(value)
	dotText := "●"
	if strings.ToLower(value) != "online" && strings.ToLower(value) != "error" {
		dotText = strings.TrimSpace(m.spinner.View())
		if dotText == "" {
			dotText = "•"
		}
	}
	dot := lipgloss.NewStyle().Foreground(color).Render(dotText)
	label := ui.muted.Render(name)
	state := lipgloss.NewStyle().Foreground(color).Render(statusLabel(value))
	return dot + " " + label + " " + state
}

func (m model) scrollMeter(width int) string {
	bar := m.progress
	bar.Width = width
	return bar.ViewAs(m.activity.ScrollPercent())
}

func (m model) panel(title string, p pane, width, height int, content string) string {
	style := ui.panel
	if m.focus == p {
		style = ui.active
	}
	titleStyle := lipgloss.NewStyle().Foreground(ui.palette.muted)
	if m.focus == p {
		titleStyle = titleStyle.Foreground(ui.palette.ink)
	}
	if p == paneDocs {
		titleStyle = titleStyle.Foreground(ui.palette.muted)
		if m.focus == p {
			titleStyle = titleStyle.Foreground(ui.palette.ink)
		}
	}
	if m.quitting {
		titleStyle = titleStyle.Foreground(ui.palette.yellow)
	}
	header := titleStyle.Render(title)
	if p == paneActivity && !m.activity.AtBottom() {
		header += ui.muted.Render(fmt.Sprintf("  history %.0f%%", m.activity.ScrollPercent()*100))
	}
	return renderBoxHeight(style, width, height, header+"\n"+content)
}

func (m model) renderFooter(width int) string {
	if m.selectMode {
		return ui.footer.Width(width).Render(
			lipgloss.NewStyle().Foreground(ui.palette.yellow).Render("select") +
				ui.muted.Render("  drag text  ·  Cmd+C copy  ·  s resume"),
		)
	}
	m.help.Width = width
	if m.help.ShowAll {
		return ui.footer.Width(width).Render(m.help.FullHelpView(m.keys.FullHelp()))
	}
	if m.flash != "" {
		return ui.footer.Width(width).Render(
			lipgloss.NewStyle().Foreground(ui.palette.green).Render(m.flash) +
				ui.muted.Render("  ·  drag selects activity rows  ·  wheel still scrolls"),
		)
	}
	if m.selection.has {
		start, end, _ := m.selection.bounds(len(m.rows))
		count := end - start + 1
		return ui.footer.Width(width).Render(commandBar(width,
			fmt.Sprintf("selected %d line%s", count, plural(count)),
			"release/y copy",
			"esc clear",
			"wheel scroll",
		))
	}
	if !m.mouse {
		return ui.footer.Width(width).Render(commandBar(width,
			"native mouse",
			"↑↓ scroll",
			"pg page",
			"g/G jump",
			"? help",
			"ctrl+c stop",
		))
	}
	return ui.footer.Width(width).Render(commandBar(width,
		"drag select",
		"↑↓ scroll",
		"wheel scroll",
		"g/G jump",
		"s select",
		"? help",
		"ctrl+c stop",
	))
}

func (m model) buildActivityRows(width int) []activityRow {
	if len(m.state.Events) == 0 {
		return []activityRow{
			{rendered: ui.muted.Render("Waiting for events."), plain: "Waiting for events."},
			{rendered: ui.muted.Render("Press ? for keys."), plain: "Press ? for keys."},
		}
	}

	rows := make([]activityRow, 0, len(m.state.Events)+2)
	for _, event := range m.state.Events {
		rows = append(rows, activityRow{
			rendered: renderEvent(event, width),
			plain:    plainEvent(event),
		})
	}
	if m.err != nil {
		text := "TUI event stream error: " + m.err.Error()
		rows = append(rows, activityRow{
			rendered: lipgloss.NewStyle().Foreground(ui.palette.red).Render(truncate(text, width)),
			plain:    text,
		})
	}
	if m.quitting {
		text := "Closing bridge dashboard safely…"
		rows = append(rows, activityRow{
			rendered: lipgloss.NewStyle().Foreground(ui.palette.yellow).Render(text),
			plain:    text,
		})
	}
	start, end, selected := m.selection.bounds(len(rows))
	if selected {
		for i := start; i <= end; i++ {
			plain := truncate(rows[i].plain, max(1, width-4))
			rows[i].rendered = lipgloss.NewStyle().
				Foreground(ui.palette.ink).
				Background(lipgloss.Color("#1F2937")).
				Render(plain)
		}
	}
	return rows
}

func renderActivityRows(rows []activityRow) string {
	lines := make([]string, 0, len(rows))
	for _, row := range rows {
		lines = append(lines, row.rendered)
	}
	return strings.Join(lines, "\n")
}

func renderEvent(event activityEvent, width int) string {
	level, tone := toneLevel(event.Tone)
	timePart := lipgloss.NewStyle().Foreground(ui.palette.muted).Render(event.Time)
	levelPart := lipgloss.NewStyle().Foreground(tone).Render(padRight(level, 5))
	labelPart := lipgloss.NewStyle().Foreground(labelColor(event.Label)).Render(padRight(truncate(event.Label, 14), 14))
	// Keep this conservative. A TUI log line that wraps is much uglier than a
	// slightly earlier ellipsis, especially once ANSI styling and box padding
	// enter the terminal renderer.
	msgWidth := max(8, width-lipgloss.Width(event.Time)-2-5-2-14-8)
	msgStyle := lipgloss.NewStyle().Foreground(ui.palette.ink)
	if event.Tone == "muted" {
		msgStyle = msgStyle.Foreground(ui.palette.muted)
	}
	message := strings.ReplaceAll(event.Message, "\n", " ↵ ")
	return fmt.Sprintf("%s  %s  %s  %s", timePart, levelPart, labelPart, msgStyle.Render(truncate(message, msgWidth)))
}

func plainEvent(event activityEvent) string {
	level, _ := toneLevel(event.Tone)
	message := strings.ReplaceAll(event.Message, "\n", " ↵ ")
	return fmt.Sprintf("%s  %-5s  %-14s  %s", event.Time, level, truncate(event.Label, 14), message)
}

func (m model) markdownContent(width int) string {
	if cached, ok := m.markdownFor[width]; ok {
		return cached
	}
	source := `---
title: Zalo Telegram Bridge
---

## Keys

| key | action |
| --- | --- |
| ↑/↓ or wheel | scroll focused pane |
| PgUp/PgDn | page focused pane |
| g / G | jump oldest / live |
| drag in activity | select rows without leaving scroll mode |
| y / ctrl+y | copy selected rows to clipboard |
| ctrl+c | copy selected rows; stop bridge when nothing is selected |
| Esc | clear selection |
| Tab | move focus between activity and help |
| s | native-select freeze fallback |
| ? or h | toggle this help |
| F1 | expanded keymap |

## Notes

- live mode follows new activity when the log is at the bottom.
- set ` + "`ZALO_TG_TUI_MOUSE=0`" + ` to keep native terminal mouse selection/scrolling.
- default mouse mode keeps wheel scrolling and adds app-level row selection/copy, similar to OpenCode's renderer-managed selection.
- copy uses local clipboard tools when available and also emits OSC52 for compatible terminals.
- select mode disables mouse capture temporarily when you need native terminal selection.
- set ` + "`ZALO_TG_TUI_ENGINE=ansi`" + ` to force the legacy TypeScript dashboard.
- set ` + "`ZALO_TG_TUI=0`" + ` for plain logs.
`
	rendered := renderMarkdown(source, width)
	m.markdownFor[width] = rendered
	return rendered
}

func renderMarkdown(markdown string, width int) string {
	clean := string(glowutils.RemoveFrontmatter([]byte(markdown)))
	if rendered, err := renderWithGlow(clean, width); err == nil {
		return strings.TrimSpace(rendered)
	}
	renderer, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithEmoji(),
		glamour.WithWordWrap(max(24, width)),
	)
	if err != nil {
		return clean
	}
	rendered, err := renderer.Render(clean)
	if err != nil {
		return clean
	}
	return strings.TrimSpace(rendered)
}

func renderWithGlow(markdown string, width int) (string, error) {
	bin, err := resolveGlowBinary()
	if err != nil {
		return "", err
	}
	cmd := exec.Command(bin, "-s", "dark", "-w", strconv.Itoa(max(24, width)), "-")
	cmd.Stdin = strings.NewReader(markdown)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return out.String(), nil
}

func resolveGlowBinary() (string, error) {
	candidates := []string{}
	if explicit := strings.TrimSpace(os.Getenv("ZALO_TG_GLOW_BIN")); explicit != "" {
		candidates = append(candidates, explicit)
	}
	if self, err := os.Executable(); err == nil {
		candidates = append(candidates, siblingBinary(self, "glow"))
	}
	if fromPath, err := exec.LookPath(glowBinaryName()); err == nil {
		candidates = append(candidates, fromPath)
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
			return candidate, nil
		}
	}
	return "", errors.New("glow binary not found")
}

func glowBinaryName() string {
	if os.PathSeparator == '\\' {
		return "glow.exe"
	}
	return "glow"
}

func siblingBinary(self, name string) string {
	if os.PathSeparator == '\\' && !strings.HasSuffix(name, ".exe") {
		name += ".exe"
	}
	return filepath.Join(filepath.Dir(self), name)
}

func alignLine(width int, left, right string) string {
	if right == "" {
		return left
	}
	space := width - lipgloss.Width(left) - lipgloss.Width(right)
	if space < 1 {
		return left
	}
	return left + strings.Repeat(" ", space) + right
}

func commandBar(width int, items ...string) string {
	if len(items) == 0 {
		return ""
	}
	separator := ui.muted.Render("  ·  ")
	line := ui.muted.Render(items[0])
	for _, item := range items[1:] {
		next := line + separator + ui.muted.Render(item)
		if lipgloss.Width(next) > width {
			break
		}
		line = next
	}
	return line
}

func horizontalRule(width int, left, center, right string) string {
	remaining := width - lipgloss.Width(left) - lipgloss.Width(center) - lipgloss.Width(right)
	if remaining < 2 {
		return truncate(left+" "+center+" "+right, width)
	}
	leftGap := remaining / 2
	rightGap := remaining - leftGap
	return left + strings.Repeat(" ", leftGap) + center + strings.Repeat(" ", rightGap) + right
}

func renderBox(style lipgloss.Style, outerWidth int, content string) string {
	innerWidth := max(1, outerWidth-style.GetHorizontalFrameSize())
	return style.Width(innerWidth).Render(content)
}

func renderBoxHeight(style lipgloss.Style, outerWidth, outerHeight int, content string) string {
	innerWidth := max(1, outerWidth-style.GetHorizontalFrameSize())
	innerHeight := max(1, outerHeight-style.GetVerticalFrameSize())
	return style.Width(innerWidth).Height(innerHeight).Render(content)
}

func signalParent() {
	parent, err := os.FindProcess(os.Getppid())
	if err != nil {
		return
	}
	_ = parent.Signal(os.Interrupt)
}

func statusLabel(value string) string {
	switch strings.ToLower(value) {
	case "online":
		return "up"
	case "error":
		return "error"
	case "stopping":
		return "stopping"
	default:
		return "connecting"
	}
}

func statusColor(value string) lipgloss.Color {
	switch strings.ToLower(value) {
	case "online":
		return ui.palette.green
	case "error":
		return ui.palette.red
	case "stopping":
		return ui.palette.yellow
	default:
		return ui.palette.cyan
	}
}

func toneGlyph(tone string) (string, lipgloss.Color) {
	switch tone {
	case "success":
		return "●", ui.palette.green
	case "info":
		return "◆", ui.palette.cyan
	case "warn":
		return "▲", ui.palette.yellow
	case "error":
		return "×", ui.palette.red
	default:
		return "·", ui.palette.muted
	}
}

func toneLevel(tone string) (string, lipgloss.Color) {
	switch tone {
	case "success":
		return "ok", ui.palette.green
	case "info":
		return "info", ui.palette.blue
	case "warn":
		return "warn", ui.palette.yellow
	case "error":
		return "error", ui.palette.red
	default:
		return "debug", ui.palette.muted
	}
}

func labelColor(label string) lipgloss.Color {
	lower := strings.ToLower(label)
	switch {
	case strings.Contains(lower, "zalo"):
		return ui.palette.ink
	case strings.Contains(lower, "telegram"), strings.Contains(lower, "tg"):
		return ui.palette.ink
	case strings.Contains(lower, "bridge"):
		return ui.palette.green
	case strings.Contains(lower, "cache"), strings.Contains(lower, "topic"):
		return ui.palette.yellow
	case strings.Contains(lower, "system"), strings.Contains(lower, "runtime"):
		return ui.palette.blue
	default:
		return ui.palette.ink
	}
}

func uptime() string {
	total := int(time.Since(startedAt).Seconds())
	hours := total / 3600
	minutes := (total % 3600) / 60
	seconds := total % 60
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds)
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func truncate(value string, width int) string {
	if width <= 0 {
		return ""
	}
	if lipgloss.Width(value) <= width {
		return value
	}
	runes := []rune(value)
	for len(runes) > 0 && lipgloss.Width(string(runes)+"…") > width {
		runes = runes[:len(runes)-1]
	}
	return string(runes) + "…"
}

func padRight(value string, width int) string {
	current := lipgloss.Width(value)
	if current >= width {
		return value
	}
	return value + strings.Repeat(" ", width-current)
}

func fillLine(value string, width int) string {
	current := lipgloss.Width(value)
	if current >= width {
		return value
	}
	return value + strings.Repeat(" ", width-current)
}

func plural(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func clamp(value, low, high int) int {
	return min(high, max(low, value))
}
