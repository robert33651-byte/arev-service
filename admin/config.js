// Настройки подключения админки к Supabase.
// Где взять: Supabase → ваш проект → Project Settings → API.
// Вставьте «Project URL» и ключ «anon public». Ключ service_role сюда НЕ вставлять.
window.AREV_CONFIG = {
  SUPABASE_URL: 'https://fmndfdfrcdbuktmdwrgf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbmRmZGZyY2RidWt0bWR3cmdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzODkyMDEsImV4cCI6MjEwNzk2NTIwMX0.xvwrFiWk4PpfhJO0FRO0_8J_lc2sqhR2j6LWnI45TfY'
};

// ТЕСТОВЫЙ РЕЖИМ: открыть любую страницу с ?test=1 — подключится тестовая база (отдельный проект Supabase,
// настоящие данные не затрагиваются). Выйти из режима: ?test=0. В тестовом режиме сверху красная полоса «ТЕСТ».
(function () {
  try {
    var q = /[?&]test=([01])/.exec(location.search);
    if (q) localStorage.setItem('arev.env', q[1] === '1' ? 'test' : 'prod');
    if (localStorage.getItem('arev.env') === 'test') {
      window.AREV_CONFIG = {
        SUPABASE_URL: 'https://rnwmjxdlxyuehwyacxtu.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_aqHFC_KiTYlljRr_Ab9frg_gch32xSP'
      };
      window.AREV_TEST = true;
      document.addEventListener('DOMContentLoaded', function () {
        var d = document.createElement('div');
        d.textContent = 'ТЕСТОВАЯ БАЗА — данные не настоящие';
        d.setAttribute('data-noi18n', '1');
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;text-align:center;font:600 12px sans-serif;padding:2px 0;pointer-events:none';
        document.body.appendChild(d);
      });
    }
  } catch (e) {}
})();
