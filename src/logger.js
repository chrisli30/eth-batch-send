/*
  Lightweight logger, print everything that is send to error, warn
  and messages to stdout (the terminal). If config.debug is set in config
  also print out everything send to debug.
*/
const _ = require('lodash');
const moment = require('moment');
const format = require('util').format;
const colors = require('colors');

class Logger {
  constructor(options) {
    this.DEBUG = (options && options.debug) || false;
    this.SILENT = (options && options.silent) || false;

    /** These methods need to match methods in Logger */

    const colorOptions = _.extend({
      info: 'grey',
      success: 'green',
      warn: 'yellow',
      debug: 'blue',
      error: 'red',
    }, options && options.colors);

    colors.setTheme(colorOptions);

    this.output = console;
  }

  error(...args) {
    this.write('error', args);
  }

  warn(...args) {
    this.write('warn', args);
  }

  info(...args) {
    this.write('info', args);
  }

  success(...args) {
    this.write('success', args);
  }

  debug(...args) {
    if (this.DEBUG) {
      this.write('info', args, 'DEBUG');
    }
  }

  write(method, args, name) {
    if (this.SILENT) {
      return;
    }

    let logName = name;
    if (!logName) {
      logName = method.toUpperCase();
    }

    let message = moment().format('YYYY-MM-DD HH:mm:ss');
    message += ` (${logName}):\t`;
    message += format(...args);

    const colorMethod = name === 'DEBUG' ? 'debug' : method;

    if (method === 'success') {
      this.output.info(colors[colorMethod](message));
    } else {
      this.output[method](colors[colorMethod](message));
    }
  }

  setDebug(value) {
    this.DEBUG = value;
  }

  setSilent(value) {
    this.SILENT = value;
  }
}

const defaultLogger = new Logger();

export default defaultLogger;
