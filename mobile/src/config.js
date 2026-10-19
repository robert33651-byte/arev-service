// Настройки подключения к серверу Supabase.
// Где взять: Supabase → ваш проект → Project Settings → API.
//   SUPABASE_URL      — поле «Project URL»
//   SUPABASE_ANON_KEY — ключ «anon public» (он публичный, его можно хранить в приложении)
// Никогда не вставляйте сюда ключ «service_role».

export const SUPABASE_URL = 'https://fmndfdfrcdbuktmdwrgf.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbmRmZGZyY2RidWt0bWR3cmdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzODkyMDEsImV4cCI6MjEwNzk2NTIwMX0.xvwrFiWk4PpfhJO0FRO0_8J_lc2sqhR2j6LWnI45TfY';

// Вход сотрудников по номеру телефона и PIN-коду.
// Технически это e-mail вида 37491123456@staff.arevservice.app — писем на него не отправляется.
export const STAFF_EMAIL_DOMAIN = 'staff.arevservice.app';
