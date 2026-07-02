/**
 * 命令注册
 */

import * as vscode from 'vscode';
import { ConfigManager } from './services/ConfigManager';
import { ModelManager } from './services/ModelManager';
import { ImageGenerator } from './services/ImageGenerator';
import { DuoYuanXChatProvider } from './provider/DuoYuanXChatProvider';
import { logger } from './utils/logger';

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: {
    configManager: ConfigManager;
    modelManager: ModelManager;
    chatProvider: DuoYuanXChatProvider;
    imageGenerator: ImageGenerator;
  },
): void {
  const { configManager, modelManager, chatProvider, imageGenerator } = deps;

  // ─── 设置 API Key ───
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.setApiKey', async () => {
      logger.info('命令: setApiKey');
      const key = await configManager.promptForApiKey();
      if (key) {
        // 清除不可用标记并刷新
        modelManager.clearUnavailable();
        chatProvider.refreshModelPicker();
      }
    }),
  );

  // ─── 刷新模型列表 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.refreshModels', async () => {
      logger.info('命令: refreshModels');
      const hasKey = await configManager.hasApiKey();
      if (!hasKey) {
        vscode.window.showWarningMessage('请先设置 API Key');
        await vscode.commands.executeCommand('copilotpp.setApiKey');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在刷新模型列表...',
          cancellable: false,
        },
        async () => {
          try {
            const models = await modelManager.refreshModels();
            chatProvider.refreshModelPicker();
            vscode.window.showInformationMessage(
              `✅ 模型列表已刷新 (${models.length} 个模型)`
            );
          } catch (err) {
            logger.error('刷新模型列表失败:', err);
            vscode.window.showErrorMessage(`刷新模型列表失败: ${(err as Error).message}`);
          }
        },
      );
    }),
  );

  // ─── 选择默认模型 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.selectModel', async () => {
      logger.info('命令: selectModel');
      const hasKey = await configManager.hasApiKey();
      if (!hasKey) {
        vscode.window.showWarningMessage('请先设置 API Key');
        await vscode.commands.executeCommand('copilotpp.setApiKey');
        return;
      }

      const models = await modelManager.getChatModels();
      if (models.length === 0) {
        vscode.window.showWarningMessage('未找到可用模型，请稍后刷新重试');
        return;
      }

      const items = models.map(m => ({
        label: m.name,
        description: m.modelId,
        detail: m.detail,
        modelId: m.modelId,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择默认聊天模型',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        await vscode.workspace
          .getConfiguration('copilotpp')
          .update('defaultModel', selected.modelId, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✅ 默认模型已设置为: ${selected.label}`);
      }
    }),
  );

  // ─── 模型参数配置 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.openModelConfig', async () => {
      logger.info('命令: openModelConfig');
      // 直接打开 Webview 模型配置面板
      await vscode.commands.executeCommand('copilotpp.manage');
    }),
  );

  // ─── 生成图像 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.generateImage', async () => {
      logger.info('命令: generateImage');
      const hasKey = await configManager.hasApiKey();
      if (!hasKey) {
        vscode.window.showWarningMessage('请先设置 API Key');
        await vscode.commands.executeCommand('copilotpp.setApiKey');
        return;
      }
      await imageGenerator.generateAndShow();
    }),
  );

  // ─── 查询余额 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotpp.checkBalance', async () => {
      logger.info('命令: checkBalance');
      const hasKey = await configManager.hasApiKey();
      if (!hasKey) {
        vscode.window.showWarningMessage('请先设置 API Key');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在查询账户信息...',
          cancellable: false,
        },
        async () => {
          try {
            const models = await modelManager.getModels(true);
            const chatModels = models.filter(m => m.modelType === 'text' && m.available);
            const imageModels = models.filter(m => m.modelType === 'image');
            const unavailable = models.filter(m => !m.available);

            const providers = configManager.getProviders();
            const providerList = Object.entries(providers)
              .map(([, p]) => `${p.label} (${p.baseUrl})`)
              .join(', ');

            const lines = [
              '📊 Copilot++ 账户状态',
              '',
              `✅ ${Object.keys(providers).length} 个供应商已配置`,
              `🔗 ${providerList || '无'}`,
              '',
              `💬 可用文本模型: ${chatModels.length} 个`,
              `🖼️ 可用图像模型: ${imageModels.length} 个`,
            ];

            if (unavailable.length > 0) {
              lines.push(`🚫 不可用模型: ${unavailable.length} 个 (${unavailable.map(m => m.name).join(', ')})`);
            }

            const msg = lines.join('\n');
            const firstProvider = Object.values(providers)[0];
            const detail = firstProvider ? `🔗 ${firstProvider.baseUrl}` : '💡 使用 "添加供应商" 配置 API';
            const firstUrl = firstProvider?.baseUrl;

            const result = await vscode.window.showInformationMessage(
              msg,
              { modal: false, detail },
              '打开官网',
            );

            if (result === '打开官网' && firstUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(firstUrl));
            }
          } catch (err) {
            logger.error('查询失败:', err);
            vscode.window.showErrorMessage(`查询失败: ${(err as Error).message}`);
          }
        },
      );
    }),
  );
}
