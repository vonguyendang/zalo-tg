function getTimestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const SSS = String(d.getMilliseconds()).padStart(3, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const tzStr = `GMT${sign}${hours}`;
  return `[${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${SSS} ${tzStr}]`;
}

function prefixArgs(args: any[]): any[] {
  if (args.length === 0) return args;
  const ts = getTimestamp();
  if (typeof args[0] === 'string') {
    if (args[0].startsWith('[')) {
      args[0] = `${ts}${args[0]}`;
    } else if (args[0].startsWith('\n[')) {
      args[0] = `\n${ts}${args[0].slice(1)}`;
    } else if (args[0].startsWith('\n')) {
      args[0] = `\n${ts} ${args[0].slice(1)}`;
    } else {
      args[0] = `${ts} ${args[0]}`;
    }
  } else {
    args.unshift(ts);
  }
  return args;
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;
const originalConsoleInfo = console.info;

let _telegramErrorReporter: ((msg: string) => void) | null = null;
export function setTelegramErrorReporter(reporter: (msg: string) => void) {
  _telegramErrorReporter = reporter;
}

console.log = function (...args: any[]) {
  originalConsoleLog.apply(console, prefixArgs(args));
};

console.warn = function (...args: any[]) {
  originalConsoleWarn.apply(console, prefixArgs(args));
};

console.error = function (...args: any[]) {
  const prefixed = prefixArgs(args);
  originalConsoleError.apply(console, prefixed);
  if (_telegramErrorReporter) {
    try {
      const util = require('util');
      _telegramErrorReporter(util.format(...prefixed));
    } catch (e) {
      // ignore
    }
  }
};

console.debug = function (...args: any[]) {
  originalConsoleDebug.apply(console, prefixArgs(args));
};

console.info = function (...args: any[]) {
  originalConsoleInfo.apply(console, prefixArgs(args));
};
