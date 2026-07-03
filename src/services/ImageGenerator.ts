/**
 * ImageGenerator — 图像生成服务
 * POST /v1/images/generations + Webview 结果展示（含分辨率/质量选择 + 下载/保存）
 */

import * as vscode from 'vscode';
import { CopilotPPApiClient } from '../api/CopilotPPApiClient';
import { ConfigManager } from './ConfigManager';
import { ModelManager } from './ModelManager';
import type { ImageGenerationRequest, ImageResult } from '../api/types';
import { logger } from '../utils/logger';

/** 质量选项（默认不发送 quality 字段，避免与分辨率冲突） */
const QUALITY_OPTIONS = [
  { label: '默认 (Auto)', description: '不指定 · 由 API 自动决定', value: undefined as undefined },
  { label: '标准 (Standard)', description: '更快生成', value: 'standard' as const },
  { label: '高清 (HD)', description: '更细腻画质', value: 'hd' as const },
];

/** 分辨率选项 */
interface SizeOption {
  label: string;
  description: string;
  size: string;
}

/** 通用分辨率选项（适用于任意图像模型） */
const DEFAULT_SIZES: SizeOption[] = [
  { label: '1:1', description: '1024×1024 · 基础', size: '1024x1024' },
  { label: '4:3', description: '1536×1152 · 基础', size: '1536x1152' },
  { label: '3:2', description: '1536×1024 · 基础', size: '1536x1024' },
  { label: '2:3', description: '1024×1536 · 基础', size: '1024x1536' },
  { label: '16:9', description: '1920×1080 · 基础', size: '1920x1080' },
  { label: '9:16', description: '1080×1920 · 基础', size: '1080x1920' },
  { label: '3:4', description: '1152×1536 · 基础', size: '1152x1536' },
  { label: '1:1 (HD)', description: '2048×2048 · 高清', size: '2048x2048' },
  { label: '16:9 (HD)', description: '3840×2160 · 高清', size: '3840x2160' },
  { label: '9:16 (HD)', description: '2160×3840 · 高清', size: '2160x3840' },
];

export class ImageGenerator {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly modelManager: ModelManager,
    private readonly apiClient: CopilotPPApiClient,
  ) {}

  /** 生成图像并展示 */
  async generateAndShow(): Promise<void> {
    // 1. 输入 prompt
    const prompt = await vscode.window.showInputBox({
      prompt: '请输入图像描述（Prompt）',
      placeHolder: 'A beautiful sunset over the ocean...',
      validateInput: (value) => {
        if (!value || value.trim().length < 3) return '请至少输入 3 个字符的描述';
        return null;
      },
    });
    if (!prompt) return;

    // 2. 选择模型（自动发现图像模型）
    const imageModels = await this.modelManager.getImageModels();
    if (imageModels.length === 0) {
      vscode.window.showWarningMessage('未发现可用的图像生成模型。请确认 API 支持 /v1/images/generations');
      return;
    }

    const modelItems = imageModels.map(m => ({
      label: m.name,
      description: m.modelId,
      modelId: m.modelId,
    }));

    const model = await vscode.window.showQuickPick(modelItems, {
      placeHolder: '选择图像生成模型',
      matchOnDescription: true,
    });
    if (!model) return;

    // 3. 选择比例/分辨率（按模型区分选项）
    const sizeOptions = DEFAULT_SIZES;
    const ratioPick = await vscode.window.showQuickPick(sizeOptions, {
      placeHolder: `选择分辨率（${model.modelId === 'gpt-image-2' ? '最高 4K/3840px' : '最高 1.5K/2000px'}）`,
      matchOnDescription: true,
    });
    if (!ratioPick) return;
    const size = ratioPick.size;

    // 4. 选择质量
    const qualityPick = await vscode.window.showQuickPick(QUALITY_OPTIONS, {
      placeHolder: '选择图像质量',
    });
    if (!qualityPick) return;

    // 5. 生成
    const imageDefaults = this.configManager.getImageDefaults();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在生成图像... (${ratioPick.label}${qualityPick.value ? ', ' + qualityPick.label : ''})`,
        cancellable: true,
      },
      async (_progress, token) => {
        try {
          // 剥离 vendor/ 前缀，API 只需要纯模型名
          const pureModelId = model.modelId.includes('/')
            ? model.modelId.substring(model.modelId.indexOf('/') + 1)
            : model.modelId;
          const req: ImageGenerationRequest = {
            model: pureModelId,
            prompt: prompt.trim(),
            n: imageDefaults.count,
            size,
            response_format: imageDefaults.responseFormat,
          };
          // 仅在用户选择非默认品质时发送 quality 参数
          if (qualityPick.value) {
            req.quality = qualityPick.value;
          }
          logger.info(`图像生成: model=${req.model}, size=${req.size}, quality=${req.quality}`);

          const ctrl = new AbortController();
          const d = token.onCancellationRequested(() => ctrl.abort());
          try {
            const result = await this.apiClient.generateImage(req, ctrl.signal);
            if (token.isCancellationRequested) return;
            if (!result.data?.length) {
              vscode.window.showErrorMessage('图像生成失败：未返回结果');
              return;
            }
            await this.showResults(result.data, prompt, model.modelId, size);
          } finally {
            d.dispose();
          }
        } catch (err) {
          logger.error('图像生成失败:', err);
          vscode.window.showErrorMessage(`图像生成失败: ${(err as Error).message}`);
        }
      },
    );
  }

  private async showResults(
    results: ImageResult[], prompt: string, modelId: string, size: string,
  ): Promise<void> {
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const src = r.url ?? (r.b64_json ? `data:image/png;base64,${r.b64_json}` : undefined);
      if (!src) { logger.warn(`结果 ${i + 1} 无 URL`); continue; }

      const panel = vscode.window.createWebviewPanel(
        `copilotpp-img-${Date.now()}-${i}`,
        results.length > 1 ? `结果 ${i + 1}/${results.length}` : '生成结果',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );

      panel.webview.html = this.buildHtml({ src, prompt, revised: r.revised_prompt ?? '', modelId, size });

      panel.webview.onDidReceiveMessage(async (msg: { type: string }) => {
        if (msg.type === 'saveAs') {
          const p = await this.saveAs(src);
          if (p) panel.webview.postMessage({ type: 'saved', path: p });
        } else if (msg.type === 'saveToWs') {
          const p = await this.saveToWorkspace(src);
          if (p) panel.webview.postMessage({ type: 'saved', path: p });
        }
      });
    }
  }

  private async saveAs(src: string): Promise<string | undefined> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`copilotpp-${Date.now()}.png`),
      filters: { 'PNG Image': ['png'] },
    });
    return uri ? this.download(src, uri.fsPath) : undefined;
  }

  private async saveToWorkspace(src: string): Promise<string | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showWarningMessage('未打开工作区，请使用"另存为"');
      return undefined;
    }
    const folder = folders.length === 1 ? folders[0]! : (await vscode.window.showWorkspaceFolderPick()) ?? folders[0]!;
    if (!folder) return undefined;
    const path = `${folder.uri.fsPath}/copilotpp-${Date.now()}.png`;
    const r = await this.download(src, path);
    if (r) vscode.window.showInformationMessage('已保存到工作区');
    return r;
  }

  private async download(src: string, filePath: string): Promise<string | undefined> {
    try {
      let data: Uint8Array;
      if (src.startsWith('data:')) {
        const base64 = src.split(',')[1] ?? '';
        const binary = atob(base64);
        data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          data[i] = binary.charCodeAt(i);
        }
      } else {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = new Uint8Array(await resp.arrayBuffer());
      }
      await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data);
      logger.info(`已保存: ${filePath}`);
      return filePath;
    } catch (err) {
      logger.error('保存失败:', err);
      vscode.window.showErrorMessage(`保存失败: ${(err as Error).message}`);
      return undefined;
    }
  }

  private buildHtml(p: { src: string; prompt: string; revised: string; modelId: string; size: string }): string {
    const e = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const ej = (s: string) => s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Copilot++</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#1e1e1e;color:#ccc;display:flex;flex-direction:column;min-height:100vh}
.tb{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#2d2d2d;border-bottom:1px solid #3d3d3d}
.tb button{display:flex;align-items:center;gap:6px;padding:6px 14px;background:#0e639c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px}
.tb button:hover{background:#1177bb}
.tb .s{background:#3d3d3d}.tb .s:hover{background:#4d4d4d}
.tb .st{margin-left:12px;font-size:12px;color:#4caf50;opacity:0;transition:opacity .3s}
.tb .st.on{opacity:1}
.img{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
img{max-width:100%;max-height:78vh;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.4);cursor:pointer}
.inf{width:100%;padding:12px 20px;background:#2d2d2d;border-top:1px solid #3d3d3d;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.inf .b{font-size:11px;padding:2px 8px;border-radius:10px;background:#3d3d3d;color:#aaa}
.inf .pr{font-size:13px;color:#aaa;flex:1;min-width:200px}
.inf .rv{font-size:12px;color:#888;font-style:italic;width:100%}
.ctx{display:none;position:fixed;background:#333;border:1px solid #555;border-radius:6px;padding:4px 0;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:1000}
.ctx .it{padding:8px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px}
.ctx .it:hover{background:#0e639c}
.ctx .dv{height:1px;background:#555;margin:4px 0}
</style></head><body>
<div class="tb">
  <button onclick="saveAs()">💾 另存为...</button>
  <button class="s" onclick="saveWs()">📁 保存到工作区</button>
  <span class="st" id="st"></span>
</div>
<div class="img" oncontextmenu="ctx(event)"><img src="${e(p.src)}" alt="${e(p.prompt)}" onclick="cpy()" title="点击复制 Prompt | 右键保存"></div>
<div class="inf">
  <span class="b">${e(p.modelId)}</span><span class="b">${e(p.size)}</span>
  <span class="pr">📝 ${e(p.prompt)}</span>
  ${p.revised ? `<div class="rv">✏️ ${e(p.revised)}</div>` : ''}
</div>
<div class="ctx" id="m">
  <div class="it" onclick="saveAs()">💾 另存为...</div>
  <div class="it" onclick="saveWs()">📁 保存到工作区</div>
  <div class="dv"></div>
  <div class="it" onclick="cpy()">📋 复制 Prompt</div>
</div>
<script>
const v=acquireVsCodeApi();
function ctx(e){e.preventDefault();const m=document.getElementById('m');m.style.display='block';m.style.left=Math.min(e.clientX,innerWidth-200)+'px';m.style.top=Math.min(e.clientY,innerHeight-120)+'px'}
document.addEventListener('click',()=>{document.getElementById('m').style.display='none'});
function saveAs(){v.postMessage({type:'saveAs'})}
function saveWs(){v.postMessage({type:'saveToWs'})}
function cpy(){navigator.clipboard.writeText('${ej(p.prompt)}').then(()=>f('📋 已复制'))}
function f(t){const e=document.getElementById('st');e.textContent=t;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),2000)}
window.addEventListener('message',e=>{if(e.data.type==='saved')f('✅ 已保存')})
</script></body></html>`;
  }
}
