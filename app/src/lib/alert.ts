// Pop-up messages and "Are you sure?" questions. On phones this is React Native's Alert;
// alert.web.ts is the browser version (React Native's Alert does nothing on web).
import { Alert } from 'react-native';

export const showAlert = Alert.alert;
