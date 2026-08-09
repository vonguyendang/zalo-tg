tell application "System Events"
    tell process "MenuTestApp"
        click menu bar item 1 of menu bar 2
        click menu item "Click" of menu 1 of menu bar item 1 of menu bar 2
    end tell
end tell
