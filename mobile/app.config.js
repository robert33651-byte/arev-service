// Варианты сборки (переменная APP_VARIANT):
//   (нет)      — рабочее приложение сотрудника
//   test       — «Arev ТЕСТ»: сотрудник, тестовая база, ставится рядом с рабочим
//   admin      — «Arev Admin»: приложение руководителя (админка, отпечаток, push), рабочая база
//   admintest  — «Arev Admin ТЕСТ»: то же, но открывает тестовую базу
module.exports = ({ config }) => {
  const v = process.env.APP_VARIANT;
  if (v === 'test') {
    const android = Object.assign({}, config.android, { package: 'am.arevservice.master.test' });
    delete android.googleServicesFile; // push в тестовой сборке выключены, пока в Firebase не добавлен пакет .test
    return Object.assign({}, config, {
      name: 'Arev ТЕСТ', slug: 'arev-test', owner: 'testarevs-team', android,
      extra: Object.assign({}, config.extra, { testBuild: true, eas: { projectId: '59de04cb-b4d4-4246-8beb-5a5171ffe8c1' } }),
    });
  }
  if (v === 'admin' || v === 'admintest') {
    const t = v === 'admintest';
    const android = Object.assign({}, config.android, {
      package: t ? 'am.arevservice.admin.test' : 'am.arevservice.admin',
      permissions: ['POST_NOTIFICATIONS', 'RECORD_AUDIO', 'USE_BIOMETRIC'],
      versionCode: 1,
    });
    delete android.googleServicesFile; // push заработают после добавления пакета в Firebase (см. инструкцию)
    const out = Object.assign({}, config, {
      name: t ? 'Arev Admin ТЕСТ' : 'Arev Admin', android,
      plugins: (config.plugins || []).filter((p) => !['expo-location', 'expo-camera'].includes(Array.isArray(p) ? p[0] : p)),
      extra: Object.assign({}, config.extra, { adminApp: true, adminUrl: t ? 'https://arev-service-admin.vercel.app/?test=1' : 'https://arev-service-admin.vercel.app/' }),
    });
    if (t) { out.slug = 'arev-test'; out.owner = 'testarevs-team'; out.extra.eas = { projectId: '59de04cb-b4d4-4246-8beb-5a5171ffe8c1' }; }
    return out;
  }
  return config;
};
