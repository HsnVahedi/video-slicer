import React from 'react';

interface SuccessModalProps {
  show: boolean;
  title: string;
  description: string;
  onClose: () => void;
}

export default function SuccessModal({ show, title, description, onClose }: SuccessModalProps) {
  if (!show) return null;
  
  const handleUploadAnother = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 text-center mb-6">{description}</p>
          <div className="flex space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
            >
              OK
            </button>
            <button
              onClick={handleUploadAnother}
              className="px-6 py-2 border-2 border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Upload another Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
