/**
 * StatusBarManager — 状态栏显示当前模型 + Token 用量
 */

import * as vscode from 'vscode';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = 'Copilot++';
    this.item.tooltip = 'Copilot++ — 当前模型与 Token 用量';
    this.item.command = 'copilotpp.selectModel';
  }

  /** 更新显示 */
  update(modelName?: string, inputTokens?: number, modelMax?: number): void {
    if (!modelName) {
      this.item.text = '$(hubot) Copilot++';
      this.item.tooltip = 'Copilot++ — 点击切换模型';
      this.item.show();
      return;
    }

    const parts: string[] = [`$(hubot) ${modelName}`];

    if (inputTokens !== undefined) {
      const k = Math.round(inputTokens / 1000);
      parts.push(`${k}K`);
      if (modelMax) {
        const pct = Math.round((inputTokens / modelMax) * 100);
        parts.push(`${pct}%`);
      }
    }

    this.item.text = parts.join(' ');
    this.item.tooltip = [
      `模型: ${modelName}`,
      inputTokens ? `输入 Token: ~${Math.round(inputTokens / 1000)}K` : '',
      modelMax ? `上下文窗口: ${Math.round(modelMax / 1000)}K` : '',
      '点击切换默认模型',
    ].filter(Boolean).join('\n');

    // 根据使用率变色
    if (inputTokens && modelMax) {
      const ratio = inputTokens / modelMax;
      if (ratio > 0.8) {
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else if (ratio > 0.5) {
        this.item.backgroundColor = undefined;
        this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      } else {
        this.item.backgroundColor = undefined;
        this.item.color = undefined;
      }
    }

    this.item.show();
  }

  /** 隐藏 */
  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
