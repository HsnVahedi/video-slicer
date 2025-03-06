interface ErrorModalProps {
  show: boolean;
  message: string;
  onClose: () => void;
}

export default function ErrorModal({ show, message, onClose }: ErrorModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Error</h3>
          <p className="text-gray-600 text-center mb-6">{message}</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
