import { registerRootComponent } from 'expo';
import { defineTrackTask } from './src/track';
import App from './App';

// Фоновая задача записи маршрута должна быть объявлена до запуска интерфейса
defineTrackTask();

registerRootComponent(App);
