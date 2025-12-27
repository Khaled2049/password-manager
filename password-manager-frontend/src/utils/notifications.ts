/**
 * Simple notification utility for user feedback
 * Can be enhanced later with a toast library if needed
 */

export const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  // For now, we'll use a simple approach
  // In a production app, you might want to use a toast library like react-hot-toast
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
    type === 'success' ? 'bg-green-600 text-white' :
    type === 'error' ? 'bg-red-600 text-white' :
    'bg-blue-600 text-white'
  }`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
};

export const showSuccess = (message: string) => showNotification(message, 'success');
export const showError = (message: string) => showNotification(message, 'error');
export const showInfo = (message: string) => showNotification(message, 'info');

