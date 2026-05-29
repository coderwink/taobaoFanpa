import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logDir: string;
  private logFile: string;

  constructor(logDir: string = './data/logs') {
    this.logDir = logDir;
    this.logFile = path.join(logDir, 'crawler.log');

    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatConsoleMessage(entry: LogEntry): string {
    const timestamp = chalk.gray(entry.timestamp);
    let level: string;

    switch (entry.level) {
      case LogLevel.DEBUG:
        level = chalk.cyan(entry.level);
        break;
      case LogLevel.INFO:
        level = chalk.green(entry.level);
        break;
      case LogLevel.WARN:
        level = chalk.yellow(entry.level);
        break;
      case LogLevel.ERROR:
        level = chalk.red(entry.level);
        break;
      default:
        level = entry.level;
    }

    let message = `${timestamp} ${level}: ${entry.message}`;

    if (entry.context) {
      message += ` ${chalk.gray(JSON.stringify(entry.context))}`;
    }

    if (entry.error) {
      message += `\n${chalk.red(entry.error.stack || entry.error.message)}`;
    }

    return message;
  }

  private writeToFile(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logFile, logLine, 'utf-8');
  }

  debug(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.DEBUG,
      message,
      context,
    };
    console.log(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  info(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.INFO,
      message,
      context,
    };
    console.log(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  warn(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.WARN,
      message,
      context,
    };
    console.warn(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.ERROR,
      message,
      context,
      error,
    };
    console.error(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  createChildLogger(prefix: string): Logger {
    const childLogger = new Logger(this.logDir);
    const originalInfo = childLogger.info.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalDebug = childLogger.debug.bind(childLogger);

    childLogger.info = (message: string, context?: Record<string, any>) => {
      originalInfo(`[${prefix}] ${message}`, context);
    };

    childLogger.error = (message: string, error?: Error, context?: Record<string, any>) => {
      originalError(`[${prefix}] ${message}`, error, context);
    };

    childLogger.warn = (message: string, context?: Record<string, any>) => {
      originalWarn(`[${prefix}] ${message}`, context);
    };

    childLogger.debug = (message: string, context?: Record<string, any>) => {
      originalDebug(`[${prefix}] ${message}`, context);
    };

    return childLogger;
  }
}

export const logger = new Logger();
