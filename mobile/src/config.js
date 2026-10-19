// Настройки подключения к серверу Supabase.
// Где взять: Supabase → ваш проект → Project Settings → API.
//   SUPABASE_URL      — поле «Project URL»
//   SUPABASE_ANON_KEY — ключ «anon public» (он публичный, его можно хранить в приложении)
// Никогда не вставляйте сюда ключ «service_role».

export const SUPABASE_URL = 'https://ВАШ_ПРОЕКТ.supabase.co';
export const SUPABASE_ANON_KEY = 'ВСТАВЬТЕ_ANON_PUBLIC_KEY';

// Вход сотрудников по номеру телефона и PIN-коду.
// Технически это e-mail вида 37491123456@staff.arevservice.app — писем на него не отправляется.
export const STAFF_EMAIL_DOMAIN = 'staff.arevservice.app';
