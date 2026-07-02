/**
 * 多元探索 (Copilot++) Copilot VS Code 插件 — 入口
 */

import * as vscode from 'vscode';
import { ConfigManager } from './services/ConfigManager';
import { ModelManager } from './services/ModelManager';
import { RequestBuilder } from './services/RequestBuilder';
import { StreamHandler } from './services/StreamHandler';
import { ImageGenerator } from './services/ImageGenerator';
import { StatusBarManager } from './services/StatusBarManager';
import { ModelManagerPanel } from './panels/ModelManagerPanel';
import { DuoYuanXApiClient } from './api/DuoYuanXApiClient';
import { DuoYuanXChatProvider } from './provider/DuoYuanXChatProvider';
import type { DuoYuanXModelInfo } from './models/ModelInfo';
import { registerCommands } from './commands';
import { logger } from './utils/logger';

let chatProvider: DuoYuanXChatProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.init();
  logger.info('Copilot++ 插件正在激活...');

  // ─── 初始化服务层 ───

  const configManager = new ConfigManager(context);

  // 迁移旧版单供应商配置
  await configManager.migrateFromLegacy();

  // 延迟创建 API Client（依赖供应商 API Key）
  const apiClient = new DuoYuanXApiClient(
    () => {
      const providers = configManager.getProviders();
      const first = Object.keys(providers)[0];
      return first ? providers[first]!.baseUrl : '';
    },
    () => configManager.getApiKey(),
    configManager.getRequestTimeout(),
  );

  const modelManager = new ModelManager(configManager, apiClient);
  const requestBuilder = new RequestBuilder(configManager);
  const streamHandler = new StreamHandler(apiClient);
  const imageGenerator = new ImageGenerator(
    configManager,
    modelManager,
    new DuoYuanXApiClient(
      () => {
        const providers = configManager.getProviders();
        const first = Object.keys(providers)[0];
        return first ? (providers[first]!.imageBaseUrl || providers[first]!.baseUrl) : '';
      },
      () => configManager.getApiKey(),
      configManager.getRequestTimeout(),
    ),
  );
  const statusBar = new StatusBarManager();

  chatProvider = new DuoYuanXChatProvider(
    configManager,
    modelManager,
    requestBuilder,
    streamHandler,
    statusBar,
  );

  // ─── 注册 LM Provider ───

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('copilotpp', chatProvider),
    { dispose: () => chatProvider?.dispose() },
    statusBar,
  );

  logger.info('LanguageModelChatProvider 已注册');

  // ─── 状态栏初始显示 ───
  const defaultModel = configManager.getDefaultModel();
  statusBar.update(defaultModel);

  // ─── 注册命令 ───

  // 模型配置面板（managementCommand，来自模型选择器齿轮图标或命令面板）
  const modelPanel = new ModelManagerPanel();
  let currentVendor: string | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.manage', async (args) => {
      const models = args?.models as DuoYuanXModelInfo[] | undefined;
      const providers = configManager.getProviders();
      const providerInfo = Object.fromEntries(
        Object.entries(providers).map(([k, v]) => [k, { label: v.label, baseUrl: v.baseUrl }])
      );
      let displayModels: DuoYuanXModelInfo[];
      if (currentVendor && providers[currentVendor]) {
        displayModels = await modelManager.getModelsForVendor(currentVendor);
      } else {
        displayModels = models ?? await modelManager.getModels(true);
      }
      chatProvider?.refreshModelPicker();
      modelPanel.show(displayModels, configManager, providerInfo, currentVendor);
    }),
  );

  // 切换供应商面板
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.selectVendor', async (vendor: string) => {
      currentVendor = vendor || undefined;
      vscode.commands.executeCommand('copilotpp.manage');
    }),
  );

  // 移除供应商
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.removeProvider', async (vendor: string) => {
      await configManager.removeProvider(vendor);
      modelManager.clearUnavailable();
      chatProvider?.refreshModelPicker();
      // 重新打开面板（刷新供应商列表）
      vscode.commands.executeCommand('copilotpp.manage');
    }),
  );

  // 重置 API 连接
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.resetApi', async () => {
      await configManager.deleteApiKey(); // 删除所有供应商 Key
      await vscode.workspace.getConfiguration('copilotpp').update('providers', {}, vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration('copilotpp').update('baseUrl', undefined, vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration('copilotpp').update('imageBaseUrl', undefined, vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration('copilotpp').update('defaultModel', '', vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration('copilotpp').update('models', {}, vscode.ConfigurationTarget.Global);
      modelManager.clearUnavailable();
      chatProvider?.refreshModelPicker();
      vscode.window.showInformationMessage('🗑️ 所有 API 连接已重置。', '添加供应商').then(sel => {
        if (sel === '添加供应商') vscode.commands.executeCommand('copilotpp.setApiKey');
      });
    }),
  );

  registerCommands(context, { configManager, modelManager, chatProvider, imageGenerator });

  // ─── 监听事件 ───

  // API Key 变更（多窗口同步）
  context.subscriptions.push(
    configManager.getSecretStore().onAnyChange(() => {
      logger.info('API Key 已变更，刷新模型选择器');
      modelManager.clearUnavailable();
      chatProvider?.refreshModelPicker();
    }),
  );

  // 配置变更
  context.subscriptions.push(
    configManager.onConfigChange(() => {
      chatProvider?.refreshModelPicker();
    }),
  );

  // ─── 激活 Copilot Chat ───

  try {
    const copilotChat = vscode.extensions.getExtension('github.copilot-chat');
    if (copilotChat && !copilotChat.isActive) {
      await copilotChat.activate();
      logger.info('Copilot Chat 已激活');
    }
  } catch {
    // Copilot Chat 未安装或不可用
    logger.info('Copilot Chat 扩展未安装');
  }

  // ─── 首次使用引导 ───

  const hasKey = await configManager.hasApiKey();
  if (!hasKey) {
    // 延迟显示，避免阻塞启动
    setTimeout(() => {
      vscode.window
        .showInformationMessage(
          '欢迎使用 Copilot++！请先设置 API Key 以开始使用。',
          '设置 API Key',
        )
        .then(selection => {
          if (selection === '设置 API Key') {
            vscode.commands.executeCommand('copilotpp.setApiKey');
          }
        });
    }, 2000);
  } else {
    // 后台预加载模型列表
    modelManager.getModels().catch(err => {
      logger.warn('预加载模型列表失败:', err);
    });
  }

  // 刷新模型选择器
  chatProvider.refreshModelPicker();

  logger.info('Copilot++ 插件已激活');
}

export async function deactivate(): Promise<void> {
  logger.info('Copilot++ 插件正在停用...');

  if (chatProvider) {
    await chatProvider.prepareForDeactivate();
  }

  logger.dispose();
}
