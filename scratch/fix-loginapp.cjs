const fs = require('fs');
let code = fs.readFileSync('src/zalo/loginApp.ts', 'utf8');

code = code.replace(
  "export async function triggerAppLogin(hooks: AppLoginHooks = {}): Promise<ZaloAPI> {",
  "export async function triggerAppLogin(hooks: AppLoginHooks = {}): Promise<{api: ZaloAPI, uid: string}> {"
);

code = code.replace(
  "return newApi as unknown as ZaloAPI;",
  "return { api: newApi as unknown as ZaloAPI, uid: String(newApi.getOwnId()) };"
);

fs.writeFileSync('src/zalo/loginApp.ts', code);
console.log('Fixed loginApp.ts');
