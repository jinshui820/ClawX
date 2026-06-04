/**
 * Device Enrollment Settings
 * Lets the user enroll this device (one-time code, machine-bound) so the client
 * can fetch its per-device LiteLLM key. Renders nothing when enrollment is not
 * configured (CLAWX_ENROLL_BASE_URL unset). See docs/customizations/device-enrollment.md.
 *
 * NOTE: strings are inline (single-language) for this enterprise feature; can be
 * moved to i18n resources later.
 */
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useEnrollmentStore } from '@/stores/enrollment';

export function EnrollmentSettings() {
  const { status, machineHash, busy, error, init, enroll, refreshConfig, reset } = useEnrollmentStore();
  const [code, setCode] = useState('');

  useEffect(() => {
    void init();
  }, [init]);

  // Not configured for this build → don't show the section at all.
  if (!status || !status.configured) {
    return null;
  }

  const onEnroll = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const ok = await enroll(trimmed);
    if (ok) {
      toast.success('设备注册成功,已获取密钥');
      setCode('');
    } else {
      toast.error(`注册失败:${useEnrollmentStore.getState().error ?? '未知错误'}`);
    }
  };

  const onRefresh = async () => {
    const ok = await refreshConfig();
    if (ok) toast.success('已刷新设备密钥');
    else toast.error(`刷新失败:${useEnrollmentStore.getState().error ?? '未知错误'}`);
  };

  const onReset = async () => {
    await reset();
    toast.success('已解绑本设备(清除本地凭证)');
  };

  return (
    <>
      <Separator className="bg-black/5 dark:bg-white/5" />
      <div>
        <h2 className="text-3xl font-serif text-foreground mb-6 font-normal tracking-tight">设备注册</h2>
        <div className="space-y-6">
          {/* 状态 */}
          <div className="flex items-center gap-2 flex-wrap">
            {status.enrolled ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 已注册
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <ShieldOff className="w-3.5 h-3.5" /> 未注册
              </Badge>
            )}
            {status.enrolled && (
              <Badge variant={status.hasKey ? 'default' : 'outline'}>
                {status.hasKey ? '已获取密钥' : '未获取密钥'}
              </Badge>
            )}
            {status.deviceId && (
              <span className="text-meta text-muted-foreground">设备 ID:{status.deviceId}</span>
            )}
          </div>

          {machineHash && (
            <p className="text-meta text-muted-foreground break-all">
              机器码(SHA-256):{machineHash.slice(0, 16)}…
            </p>
          )}

          {!status.enrolled ? (
            // 未注册:输入注册码
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">注册码</Label>
              <p className="text-meta text-muted-foreground">
                向管理员领取一次性注册码,绑定本机后即可自动获取模型访问密钥。
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="输入注册码"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onEnroll();
                  }}
                />
                <Button onClick={() => void onEnroll()} disabled={busy || !code.trim()} size="sm">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '注册'}
                </Button>
              </div>
            </div>
          ) : (
            // 已注册:刷新密钥 / 解绑
            <div className="flex items-center gap-2">
              <Button onClick={() => void onRefresh()} disabled={busy} variant="outline" size="sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-1">刷新密钥</span>
              </Button>
              <Button onClick={() => void onReset()} disabled={busy} variant="outline" size="sm">
                解绑本设备
              </Button>
            </div>
          )}

          {error && <p className="text-meta text-destructive">{error}</p>}
        </div>
      </div>
    </>
  );
}
