/**
 * ModelManagerPanel — 模型参数配置 Webview 面板
 * 提供 UI 表单配置每个模型的能力参数（上下文窗口、输出 Token、思考模式等）
 */

import * as vscode from 'vscode';
import type { CopilotPPModelInfo } from '../models/ModelInfo';

export class ModelManagerPanel {
  private panel: vscode.WebviewPanel | undefined;

  async show(models: CopilotPPModelInfo[], configManager: {
    getModelSettingsMap(): Record<string, any>;
    saveModelSettings(map: Record<string, any>): Promise<void>;
  }, providers?: Record<string, { label: string; baseUrl: string }>, selectedVendor?: string): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      this.panel.webview.html = this.buildHtml(models, configManager.getModelSettingsMap(), providers, selectedVendor);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotpp.modelConfig',
      'Copilot++ 模型配置',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.buildHtml(models, configManager.getModelSettingsMap(), providers, selectedVendor);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'save') {
        await configManager.saveModelSettings(msg.settings);
        await vscode.commands.executeCommand('copilotpp.refreshModels');
        vscode.window.showInformationMessage('✅ 模型配置已保存。');
      }
      if (msg.type === 'selectVendor') {
        await vscode.commands.executeCommand('copilotpp.selectVendor', msg.vendor);
      }
      if (msg.type === 'refresh') {
        vscode.commands.executeCommand('copilotpp.refreshModels');
      }
      if (msg.type === 'addProvider') {
        await vscode.commands.executeCommand('copilotpp.setApiKey');
      }
      if (msg.type === 'removeProvider') {
        const vendor = msg.vendor as string; if (!vendor) return;
        await vscode.commands.executeCommand('copilotpp.removeProvider', vendor);
        vscode.window.showInformationMessage(`供应商 "${vendor}" 已移除`);
      }
      if (msg.type === 'reset') {
        const confirmed = await vscode.window.showWarningMessage(
          '确定要重置所有 API 连接吗？', { modal: true }, '确认重置',
        );
        if (confirmed === '确认重置') {
          this.panel?.dispose();
          vscode.commands.executeCommand('copilotpp.resetApi');
        }
      }
    });

    this.panel.onDidDispose(() => { this.panel = undefined; });
  }

  private buildHtml(models: CopilotPPModelInfo[], currentSettings: Record<string, any>, providers?: Record<string, { label: string; baseUrl: string }>, selectedVendor?: string): string {
    const modelRows = models
      .filter(m => m.modelType === 'text')
      .map(m => this.buildModelRow(m, currentSettings[m.modelId] ?? {}))
      .join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot++ 模型配置</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }
  .header-icon { font-size: 22px; }
  h2 { font-size: 18px; font-weight: 600; }
  .subtitle {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .model-card {
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.08));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 14px;
    transition: border-color 0.15s;
  }
  .model-card:hover {
    border-color: var(--vscode-focusBorder, rgba(128,128,128,0.4));
  }
  .model-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
  }
  .model-name {
    font-weight: 600;
    font-size: 14px;
  }
  .model-family {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-badge-background, rgba(128,128,128,0.15));
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .model-id {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, 'SF Mono', Menlo, monospace);
    margin-top: 2px;
  }
  .model-form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px 20px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .form-group.full { grid-column: 1 / -1; }
  label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 500;
  }
  input[type="number"], select {
    padding: 7px 10px;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.25));
    border-radius: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 12px;
    font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input[type="number"]:focus, select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
  }
  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 28px;
  }
  .checkbox-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    grid-column: 1 / -1;
    padding-top: 4px;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-foreground);
    cursor: pointer;
    user-select: none;
  }
  .checkbox-label input[type="checkbox"] {
    width: 15px; height: 15px;
    cursor: pointer;
    accent-color: var(--vscode-button-background);
  }
  .effort-group[style*="display: none"] {
    display: none !important;
  }
  .btn-bar {
    margin-top: 28px;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  button {
    padding: 8px 18px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: opacity 0.15s, background 0.15s;
  }
  button:hover { opacity: 0.9; }
  button:active { transform: translateY(1px); }
  .btn-save {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-save:hover { background: var(--vscode-button-hoverBackground); opacity: 1; }
  .btn-refresh {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-reset {
    background: transparent;
    color: var(--vscode-errorForeground, #f48771);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.25));
    margin-left: auto;
  }
  .btn-reset:hover {
    background: var(--vscode-inputValidation-errorBackground, rgba(244,135,113,0.1));
  }
  .note {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 16px;
    padding: 10px 14px;
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08));
    border-radius: 5px;
    border-left: 3px solid var(--vscode-textLink-foreground, #3794ff);
    line-height: 1.6;
  }
  .provider-section { margin-bottom: 24px; }
  .provider-tabs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .provider-tab {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 14px; font-size: 12px; cursor: pointer;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.25));
    color: var(--vscode-foreground); background: transparent;
    transition: all 0.15s;
  }
  .provider-tab:hover { border-color: var(--vscode-focusBorder); }
  .provider-tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .provider-tab .remove { opacity: 0.5; font-size: 13px; }
  .provider-tab .remove:hover { opacity: 1; color: var(--vscode-errorForeground); }
  .btn-add {
    padding: 5px 14px; border: 1px dashed var(--vscode-input-border); border-radius: 14px;
    cursor: pointer; font-size: 12px; background: transparent; color: var(--vscode-foreground);
  }
  .btn-add:hover { border-color: var(--vscode-focusBorder); }
  .no-provider { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 8px 0; }
</style>
</head>
<body>
<div class="header">
  <span class="header-icon">⚙️</span>
  <h2>Copilot++ 模型配置</h2>
</div>
<p class="subtitle">配置每个模型的上下文窗口、Token 限制和思考模式。保存后在 Copilot Chat 模型选择器中重新选择模型即可生效。</p>
${this.buildProviderSection(providers, selectedVendor)}
${modelRows}
<div class="btn-bar">
  <button class="btn-save" onclick="save()">💾 保存配置</button>
  <button class="btn-refresh" onclick="refresh()">🔄 刷新模型列表</button>
  <button class="btn-reset" onclick="resetApi()">🗑️ 重置 API 连接</button>
</div>
<p class="note">💡 修改模型配置后，在 Copilot Chat 模型选择器中重新选择模型即可应用新设置。思考强度选项会根据所选思考模式自动调整。</p>
<script>
  const vscode = acquireVsCodeApi();

  // 每种思考模式对应的强度档位（UI 低/中/高 → API 实际值）
  const EFFORT_BY_TYPE = {
    'reasoning_object': [['low','低'],['medium','中'],['high','高'],['xhigh','超高']],
    'thinking_type':    [['low','无 (none)'],['medium','高 (high)'],['high','极限 (max)']],
    'thinking_config':  [['low','低'],['medium','中'],['high','高']],
    'thinking_level':   [['medium','高 (high)'],['high','极限 (max)']],
    // 以下模式无强度选项
    'disabled': [],
    'thinking_adaptive': [],
    'thinking_enabled': [],
    'enable_thinking': [],
    'preserve_thinking': [],
    'auto': [],
  };

  // 根据思考模式更新强度下拉选项
  function updateEffortOptions(typeSelect) {
    const card = typeSelect.closest('.model-card');
    const type = typeSelect.value;
    const effortGroup = card.querySelector('.effort-group');
    const effortSelect = effortGroup.querySelector('[data-field="thinkingEffort"]');
    const currentEffort = effortSelect.dataset.current || 'medium';

    const options = EFFORT_BY_TYPE[type] || [];

    if (options.length === 0) {
      // 无强度选项：隐藏整个 form-group
      effortGroup.style.display = 'none';
      effortSelect.innerHTML = '<option value="">不适用</option>';
      effortSelect.value = '';
    } else {
      effortGroup.style.display = '';
      effortSelect.innerHTML = options.map(function(opt) {
        var v = opt[0], l = opt[1];
        return '<option value="' + v + '"' + (v === currentEffort ? ' selected' : '') + '>' + l + '</option>';
      }).join('');
      // 如果当前值不在新选项中，选第一个
      if (!options.some(function(opt) { return opt[0] === currentEffort; })) {
        effortSelect.value = options[0][0];
      }
    }
  }

  // 初始化所有模型的强度选项（直接执行，不依赖 DOMContentLoaded）
  (function initAllEffortOptions() {
    document.querySelectorAll('.model-card').forEach(card => {
      const typeSelect = card.querySelector('[data-field="thinkingType"]');
      if (typeSelect) updateEffortOptions(typeSelect);
    });
  })();

  function save() {
    const settings = {};
    document.querySelectorAll('.model-card').forEach(card => {
      const modelId = card.dataset.modelId;
      const effortSelect = card.querySelector('[data-field="thinkingEffort"]');
      settings[modelId] = {
        contextWindow: parseInt(card.querySelector('[data-field="contextWindow"]').value) || 128000,
        maxOutputTokens: parseInt(card.querySelector('[data-field="maxOutputTokens"]').value) || 4096,
        vision: card.querySelector('[data-field="vision"]').checked,
        tools: card.querySelector('[data-field="tools"]').checked,
        thinkingType: card.querySelector('[data-field="thinkingType"]').value,
        thinkingEffort: effortSelect.value || 'medium',
        thinkingCanDisable: card.querySelector('[data-field="thinkingCanDisable"]').checked,
        disableTemperatureWhenThinking: card.querySelector('[data-field="disableTemperatureWhenThinking"]').checked,
      };
    });
    vscode.postMessage({ type: 'save', settings });
  }
  function refresh() {
    vscode.postMessage({ type: 'refresh' });
  }
  function resetApi() {
    vscode.postMessage({ type: 'reset' });
  }
  function addProvider() {
    vscode.postMessage({ type: 'addProvider' });
  }
  function removeProvider(vendor) {
    vscode.postMessage({ type: 'removeProvider', vendor: vendor });
  }
  function selectVendor(vendor) {
    vscode.postMessage({ type: 'selectVendor', vendor: vendor });
  }
  // 委托事件处理：点击整个 provider-tabs 区域，根据 data-action 分发
  document.querySelector('.provider-tabs').addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const vendor = target.dataset.vendor;
    if (action === 'select' && vendor !== undefined) {
      vscode.postMessage({ type: 'selectVendor', vendor: vendor });
    } else if (action === 'remove' && vendor) {
      vscode.postMessage({ type: 'removeProvider', vendor: vendor });
    } else if (action === 'add') {
      vscode.postMessage({ type: 'addProvider' });
    }
  });
</script>
</body>
</html>`;
  }

  private buildProviderSection(providers?: Record<string, { label: string; baseUrl: string }>, selectedVendor?: string): string {
    if (!providers || Object.keys(providers).length === 0) {
      return `<div class="provider-section">
        <div class="no-provider">⚠️ 尚未添加 API 供应商。点击下方按钮添加。</div>
        <button class="btn-add" onclick="addProvider()">+ 添加供应商</button>
      </div>`;
    }
    // Provider tabs: 每个供应商一个 tab + "全部" tab
    const vendors = Object.keys(providers);
    const current = selectedVendor || '';
    let tabs = `<span class="provider-tab ${current === '' ? 'active' : ''}" data-action="select" data-vendor="">全部</span>`;
    for (const v of vendors) {
      tabs += `<span class="provider-tab ${current === v ? 'active' : ''}" data-action="select" data-vendor="${this.esc(v)}">
        ${this.esc(providers[v]!.label)}
        <span class="remove" data-action="remove" data-vendor="${this.esc(v)}" title="移除供应商">✕</span>
      </span>`;
    }
    return `<div class="provider-section">
      <div class="provider-tabs">${tabs}<button class="btn-add" data-action="add">+</button></div>
    </div>`;
  }

  private buildModelRow(m: CopilotPPModelInfo, settings: Record<string, any> = {}): string {
    const ctx = settings.contextWindow ?? m.maxInputTokens ?? 128000;
    const out = settings.maxOutputTokens ?? m.maxOutputTokens ?? 4096;
    const vision = settings.vision ?? false;
    const tools = settings.tools ?? false;
    const thinkingType = settings.thinkingType ?? 'disabled';
    const thinkingEffort = settings.thinkingEffort ?? 'medium';
    const thinkingCanDisable = settings.thinkingCanDisable ?? true;
    const disableTemp = settings.disableTemperatureWhenThinking ?? false;

    const thinkingOptions = [
      ['disabled', '关闭'],
      ['reasoning_object', 'GPT-5.5/5.4 (reasoning)'],
      ['thinking_type', 'DeepSeek V4 (reasoning_effort)'],
      ['thinking_adaptive', 'Claude 4.8 (adaptive)'],
      ['thinking_enabled', 'Claude 4.7 / MiniMax (enabled)'],
      ['enable_thinking', 'Qwen 3.7 (enable_thinking)'],
      ['thinking_config', 'Gemini 3.1 (thinkingConfig)'],
      ['thinking_level', 'GLM 5.2 (thinking_level)'],
      ['preserve_thinking', 'Kimi K2.7 (preserve_thinking)'],
      ['auto', '自动检测'],
    ];

    return `
<div class="model-card" data-model-id="${this.esc(m.modelId)}">
  <div class="model-header">
    <div>
      <div class="model-name">${this.esc(m.name)}</div>
      <div class="model-id">${this.esc(m.modelId)}</div>
    </div>
    <span class="model-family">${this.esc(m.family)}</span>
  </div>
  <div class="model-form">
    <div class="form-group">
      <label>上下文窗口 (tokens)</label>
      <input type="number" data-field="contextWindow" value="${ctx}" min="4096" step="1000">
    </div>
    <div class="form-group">
      <label>最大输出 (tokens)</label>
      <input type="number" data-field="maxOutputTokens" value="${out}" min="256" step="100">
    </div>
    <div class="form-group">
      <label>思考模式</label>
      <select data-field="thinkingType" onchange="updateEffortOptions(this)">
        ${thinkingOptions.map(([v, l]) => `<option value="${v}"${v === thinkingType ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-group effort-group" data-effort-type="${thinkingType}">
      <label>思考强度</label>
      <select data-field="thinkingEffort" data-current="${thinkingEffort}"></select>
    </div>
    <div class="checkbox-row">
      <label class="checkbox-label"><input type="checkbox" data-field="vision"${vision ? ' checked' : ''}> 支持视觉</label>
      <label class="checkbox-label"><input type="checkbox" data-field="tools"${tools ? ' checked' : ''}> 工具调用</label>
      <label class="checkbox-label"><input type="checkbox" data-field="thinkingCanDisable"${thinkingCanDisable ? ' checked' : ''}> 可关闭思考</label>
      <label class="checkbox-label"><input type="checkbox" data-field="disableTemperatureWhenThinking"${disableTemp ? ' checked' : ''}> 思考时移除 temperature</label>
    </div>
  </div>
</div>`;
  }

  private esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
