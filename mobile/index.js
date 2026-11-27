import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';

const isAdmin = !!(Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.adminApp);
if (isAdmin) {
  registerRootComponent(require('./AdminApp').default);
} else {
  const { defineTrackTask } = require('./src/track');
  // Фоновая задача записи маршрута должна быть объявлена до запуска интерфейса
  defineTrackTask();
  registerRootComponent(require('./App').default);
}
