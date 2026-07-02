/**
 * SecretStore — 多供应商 API Key 安全存储
 */

import * as vscode from 'vscode';

const PREFIX = 'copilotpp.apikey.';
const LEGACY_KEY = 'copilotpp.apiKey';

export class SecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private vendorKey(vendor: string): string {
    return PREFIX + vendor;
  }

  async set(vendor: string, key: string): Promise<void> {
    await this.context.secrets.store(this.vendorKey(vendor), key.trim());
  }

  async get(vendor: string): Promise<string | undefined> {
    return this.context.secrets.get(this.vendorKey(vendor));
  }

  async delete(vendor: string): Promise<void> {
    await this.context.secrets.delete(this.vendorKey(vendor));
  }

  /** 检查某供应商是否已设置 Key */
  async hasKey(vendor: string): Promise<boolean> {
    const key = await this.get(vendor);
    return !!key && key.length > 0;
  }

  /** 迁移旧版单 key → 新版多 key（返回迁移后的 vendor） */
  async migrateLegacy(defaultVendor: string): Promise<string | undefined> {
    try {
      const old = await this.context.secrets.get(LEGACY_KEY);
      if (old) {
        await this.set(defaultVendor, old);
        await this.context.secrets.delete(LEGACY_KEY);
        return defaultVendor;
      }
    } catch { /* ignore */ }
    return undefined;
  }

  /** 检查是否存在任意供应商的 Key */
  async hasAnyKey(): Promise<boolean> {
    try {
      const old = await this.context.secrets.get(LEGACY_KEY);
      if (old) return true;
    } catch { /* ignore */ }
    return false; // 无法枚举所有 key，由 ConfigManager 管理供应商列表
  }

  /** 监听 Key 变更 */
  onAnyChange(listener: () => void): vscode.Disposable {
    return this.context.secrets.onDidChange(e => {
      if (e.key.startsWith(PREFIX) || e.key === LEGACY_KEY) {
        listener();
      }
    });
  }
}
