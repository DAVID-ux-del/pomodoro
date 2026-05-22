# Pomodoro Timer

## 收款码设置

将你的支付宝和微信收款码图片放到项目目录：

1. **支付宝收款码** → `qrcode-alipay.png`
2. **微信收款码** → `qrcode-wechat.png`

建议尺寸：220x220 像素。如果不放，用户升级时会显示占位提示。

## 启动

```bash
npm start
```

打开 http://localhost:3000

## 管理后台

http://localhost:3000/admin.html

默认管理员：admin / admin123

## 会员流程

1. 注册免费试用 1 天
2. 到期后显示付款二维码
3. 用户扫码付款，填写备注，提交申请
4. 管理员在后台看到申请，确认后开通会员（30天）
