/**
 * 日志工具
 */

import * as vscode from 'vscode';

/** 日志级别 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

class Logger {
  private outputChannel: vscode.LogOutputChannel | undefined;
  private level: LogLevel = LogLevel.INFO;

  /** 初始化日志通道 */
  init(): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('Copilot++', { log: true });
    }
  }

  /** 设置日志级别 */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** 获取日志通道（用于调试） */
  getChannel(): vscode.LogOutputChannel | undefined {
    return this.outputChannel;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, args);
  }

  /** 显示输出通道 */
  show(): void {
    this.outputChannel?.show();
  }

  dispose(): void {
    this.outputChannel?.dispose();
    this.outputChannel = undefined;
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${LOG_LEVEL_LABELS[level]}]`;

    if (this.outputChannel) {
      const formatted = args.length > 0
        ? `${prefix} ${message} ${args.map(a => JSON.stringify(a)).join(' ')}`
        : `${prefix} ${message}`;

      switch (level) {
        case LogLevel.DEBUG:
          this.outputChannel.debug(formatted);
          break;
        case LogLevel.INFO:
          this.outputChannel.info(formatted);
          break;
        case LogLevel.WARN:
          this.outputChannel.warn(formatted);
          break;
        case LogLevel.ERROR:
          this.outputChannel.error(formatted);
          break;
      }
    }
  }
}

/** 全局日志实例 */
export const logger = new Logger();
