import React from 'react';

interface SuccessModalProps {
  show: boolean;
  message: string;
  hideSuccessMessages: boolean;
  onHideSuccessMessagesChange: (hide: boolean) => void;
  onClose: () => void;
}

export default function SuccessModal({
  show,
  message,
  hideSuccessMessages,
  onHideSuccessMessagesChange,
  onClose
}: SuccessModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
        <div className="flex flex-col items-center">
          <p className="text-gray-600 text-center mb-6">{message}</p>
          
          {/* Checkbox for "Don't show this message again" */}
          <div className="flex items-center mb-4 w-full">
            <input
              id="dont-show-again"
              type="checkbox"
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              checked={hideSuccessMessages}
              onChange={(e) => onHideSuccessMessagesChange(e.target.checked)}
            />
            <label htmlFor="dont-show-again" className="ml-2 text-sm text-gray-600 cursor-pointer">
              Don't show this message again
            </label>
          </div>
          
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
