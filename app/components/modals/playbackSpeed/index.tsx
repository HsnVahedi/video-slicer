import React from 'react';

interface PlaybackSpeedModalProps {
  show: boolean;
  selectedSpeed: number;
  onSpeedChange: (speed: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function PlaybackSpeedModal({
  show,
  selectedSpeed,
  onSpeedChange,
  onApply,
  onCancel
}: PlaybackSpeedModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Video Playback Speed</h3>
          
          <div className="w-full grid grid-cols-3 gap-2 mb-6">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`py-2 px-4 rounded-md transition-colors ${
                  selectedSpeed === speed 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
          
          <div className="flex w-full justify-between">
            <button
              onClick={onApply}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Set Speed
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
