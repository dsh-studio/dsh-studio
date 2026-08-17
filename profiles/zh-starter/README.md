# zh-starter

DSH Studio 的中文起步 profile 模板。

```sh
mkdir -p ~/.dsh/profiles/zh-starter
cp package.json cordis.patch.yml ~/.dsh/profiles/zh-starter/
npx @deepseek-ai/dsh --profile zh-starter --dump-config   # 验证
```

模型路由配置见 [dsh-guide-zh 第 2 章](https://github.com/dsh-studio/dsh-guide-zh/blob/main/02-接入国产模型.md)。
