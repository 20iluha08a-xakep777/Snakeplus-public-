// 1. Инициализация
await Cloud.init();
console.log('user:', Cloud.getUser());  // null — пока не вошли

// 2. Анонимный вход
await Cloud.signInAnonymously();
console.log('user:', Cloud.getUser());  // { id: "...", ... }
console.log('profile:', Cloud.getProfile());  // { snake_id: 100042, ... }

// 3. Первый синк
const r = await Cloud.push();
console.log('push:', r);  // { ok: true, merged: {...} }