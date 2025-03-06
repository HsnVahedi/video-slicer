'use client';

import { useState, useEffect, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import ErrorModal from '@/app/components/modals/error';
import ProgressingModal from '@/app/components/modals/progress';


type Slice = {
  start: number;
  end: number;
}; 
                  

export default function VideoUploader() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSplitPopup, setShowSplitPopup] = useState(false);
  const [showEndSplitPopup, setShowEndSplitPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState(0);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splittingStartTime, setSplittingStartTime] = useState<number | null>(null);
  const [slices, setSlices] = useState<Slice[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showDeleteSlicePopup, setShowDeleteSlicePopup] = useState(false);
  const [errorModal, setErrorModal] = useState<{show: boolean, message: string}>({show: false, message: ""});
  const [successModal, setSuccessModal] = useState<{show: boolean, message: string}>({show: false, message: ""});
  const [sliceCreatedModal, setSliceCreatedModal] = useState<boolean>(false);
  const [hideSuccessMessages, setHideSuccessMessages] = useState<boolean>(false);
  const [showSpeedModal, setShowSpeedModal] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedSpeed, setSelectedSpeed] = useState<number>(1);
  const [showNoSlicesToExportModal, setShowNoSlicesToExportModal] = useState<boolean>(false);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [showVideoSizeWarningModal, setShowVideoSizeWarningModal] = useState<boolean>(false);
  const [showSplittingInProgressModal, setShowSplittingInProgressModal] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);


  const splitVideo = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) {
      showError("FFmpeg is not initialized. Please refresh the page and try again.");
      setShowSplittingInProgressModal(false);
      return;
    }

    if (!videoSrc) {
      showError("No video source found. Please upload a video first.");
      setShowSplittingInProgressModal(false);
      return;
    }

    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      // Download the video from the blob URL
      const response = await fetch(videoSrc);
      const videoBlob = await response.blob();
      const videoArrayBuffer = await videoBlob.arrayBuffer();
      const videoUint8Array = new Uint8Array(videoArrayBuffer);
      
      // Determine file extension from MIME type for input file
      const mimeType = videoBlob.type;
      const inputExtension = mimeType === 'video/webm' ? 'webm' : 
                            mimeType === 'video/mp4' ? 'mp4' : 
                            mimeType === 'video/quicktime' ? 'mov' : 'mp4';
      
      // Write original video file to FFmpeg's virtual file system
      const inputFilename = `input.${inputExtension}`;
      ffmpeg.writeFile(inputFilename, videoUint8Array);
      
      // Sort slices by start time before processing
      const sortedSlices = [...slices].sort((a, b) => a.start - b.start);
      
      // Process each slice - keeping the original format
      const slicePromises = sortedSlices.map(async (slice, index) => {
        const sliceFilename = `slice_${index}.${inputExtension}`;
        const startTime = formatTime(slice.start).slice(0, 8); // HH:MM:SS format
        const duration = slice.end - slice.start;
        
        // Execute FFmpeg command to extract slice
        await ffmpeg.exec([
          '-ss', startTime,
          '-i', inputFilename,
          '-t', duration.toString(),
          '-c', 'copy', // Use copy to maintain the original codecs
          sliceFilename
        ]);
        
        // Read the output file
        const data = await ffmpeg.readFile(sliceFilename);
        
        // Create file name for the slice with proper extension
        const sliceFileName = `${formatTime(slice.start).replace(/:/g, '-')}_to_${formatTime(slice.end).replace(/:/g, '-')}.${inputExtension}`;
        
        // Add to zip in folder by sequence number
        const folder = zip.folder(`${index + 1}`);
        if (folder) {
          folder.file(sliceFileName, data);
        } else {
          // Fallback: add to root with folder prefix
          zip.file(`${index + 1}/${sliceFileName}`, data);
        }
        
        return { 
          fileName: sliceFileName, 
          folderName: `${index + 1}` 
        };
      });
      
      // Wait for all slices to be processed
      const sliceResults = await Promise.all(slicePromises);
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create a download link for the zip
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `video_slices_export.zip`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up URL to prevent memory leaks
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
      
      showSuccess(`Successfully exported ${sliceResults.length} slice${sliceResults.length > 1 ? 's' : ''} in a zip file!`);
    } catch (error) {
      console.error('Error splitting video:', error);
      showError(`Error splitting video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setShowSplittingInProgressModal(false);
    }
  };

  
  const loadFFmpeg = async () => {
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', (message) => {
        console.log(message);
      });
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegRef.current = ffmpeg;
    } catch (error) {
      showError(`Failed to load FFmpeg: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    loadFFmpeg();
  }, []);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Get file size in bytes
      const fileSizeInBytes = file.size;
      setVideoSize(fileSizeInBytes);
      // Format file size using the new function
      const formattedSize = formatVideoSize(fileSizeInBytes);
      
      console.log(`Video size: ${fileSizeInBytes} bytes (${formattedSize})`);
      
      // Create a blob URL that references the file
      // This allows streaming without loading the entire file into memory
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
    }
  };

  // Trigger file input click when button is clicked
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Update current time when video is playing
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Set video duration once metadata is loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackSpeed; // Apply current playback speed
    }
  };

  // Handle play/pause toggle
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        handleClosePopup();
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Update playing state when video state changes
  const handlePlayStateChange = () => {
    if (videoRef.current) {
      setIsPlaying(!videoRef.current.paused);
    }
  };

  // Calculate the appropriate transform based on timeline position
  const calculateTransform = (currentTime: number, duration: number) => {
    // If clicked near the beginning, reduce the transform amount
    if (currentTime / duration < 0.5) {
      // Linear interpolation: 0% transform at position 0, -50% transform at position 0.5
      const transformPercent = (currentTime / duration) * 2 * (-50);
      return `translateX(${transformPercent}%)`;
    } else if (currentTime / duration > 0.5) {
      const transformPercent = -50 - (currentTime / duration) * 50;
      return `translateX(${transformPercent}%)`;
    }
    // Use full -50% transform for middle and right side clicks
    return 'translateX(-50%)';
  };

  // Handle timeline click to seek video
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && duration > 0) {
      const timelineRect = e.currentTarget.getBoundingClientRect();
      const clickPosition = e.clientX - timelineRect.left;
      const percentClicked = clickPosition / timelineRect.width;
      const newTime = percentClicked * duration;
      handleClosePopup();
      
      // Pause the video and update current time
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      
      // Show popup at click position with calculated transform
      setPopupPosition(clickPosition);
      
      if (isSplitting) {
        // setShowEndSplitPopup(true);
      } else {
        // check if the clicked moment is inside a slice
        const isInsideSlice = slices.some(slice => 
          newTime >= slice.start && newTime <= slice.end
        );
        if (isInsideSlice) {
          setShowDeleteSlicePopup(true);
        } else {
          // setShowSplitPopup(true);
        }
      }
    }
  };

  // Hide split popups
  const handleClosePopup = () => {
    setShowSplitPopup(false);
    setShowEndSplitPopup(false);
    setShowDeleteSlicePopup(false);
  };

  // Clean up blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  // Add this function to show the error modal
  const showError = (message: string) => {
    setErrorModal({show: true, message});
  };

  // Add this function to show the success modal
  const showSuccess = (message: string) => {
    // Only show the modal if the user hasn't chosen to hide them
    if (!hideSuccessMessages) {
      setSuccessModal({show: true, message});
    }
  };

  // Add this function to show the slice created modal
  const showSliceCreatedSuccess = () => {
    setSliceCreatedModal(true);
  };

  // Apply the selected playback speed to the video
  const applyPlaybackSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
      showSuccess(`Playback speed set to ${speed}x`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Slicing in Progress Modal */}
      <ProgressingModal 
        show={showSplittingInProgressModal}
        title="Processing Video"
        description="Generating your video slices. This might take a while. Please wait and make sure to keep this window open."
      />
      
      {/* Error Modal */}
      <ErrorModal 
        show={errorModal.show}
        message={errorModal.message}
        onClose={() => setErrorModal({show: false, message: ""})}
      />
      
      {/* Success Modal */}
      {successModal.show && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
            <div className="flex flex-col items-center">
              <p className="text-gray-600 text-center mb-6">{successModal.message}</p>
              
              {/* Checkbox for "Don't show this message again" */}
              <div className="flex items-center mb-4 w-full">
                <input
                  id="dont-show-again"
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                  checked={hideSuccessMessages}
                  onChange={(e) => setHideSuccessMessages(e.target.checked)}
                />
                <label htmlFor="dont-show-again" className="ml-2 text-sm text-gray-600 cursor-pointer">
                  Don't show this message again
                </label>
              </div>
              
              <button
                onClick={() => setSuccessModal({show: false, message: ""})}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Slice Created Success Modal */}
      {sliceCreatedModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Success</h3>
              <p className="text-gray-600 text-center mb-6">Successfully created the slice!</p>
              <button
                onClick={() => setSliceCreatedModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Speed Control Modal */}
      {showSpeedModal && (
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
                    onClick={() => setSelectedSpeed(speed)}
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
                  onClick={() => {
                    applyPlaybackSpeed(selectedSpeed);
                    setShowSpeedModal(false);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Set Speed
                </button>
                <button
                  onClick={() => {
                    setSelectedSpeed(playbackSpeed);
                    setShowSpeedModal(false);
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* No Slices To Export Modal */}
      {showNoSlicesToExportModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Slices Available</h3>
              <p className="text-gray-600 text-center mb-6">There are no slices to export! Create some slices first then export them.</p>
              <button
                onClick={() => setShowNoSlicesToExportModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Video Size Warning Modal */}
      {showVideoSizeWarningModal && videoSize && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10 relative">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Memory Usage Warning</h3>
              <p className="text-gray-600 text-center mb-6">
                Your video's file size is {formatVideoSize(videoSize)}. Please make sure you have at least 2 times more available memory on your device before proceeding; otherwise, you might get errors.
              </p>
              <div className="flex w-full justify-between gap-4">
                <button
                  onClick={
                    async () => {
                      setShowVideoSizeWarningModal(false);
                      setShowSplittingInProgressModal(true);
                      await splitVideo();
                      // setShowSplittingInProgressModal(false);
                    }
                  }
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Split the video into slices
                </button>
                <button
                  onClick={() => setShowVideoSizeWarningModal(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {!videoSrc ? (
        <>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={handleUploadClick}
            className="text-xl py-6 px-10 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Upload your Video
          </button>
        </>
      ) : (
        <div className="video-container w-full flex flex-col items-center">
          <div className="relative min-w-[40vw] w-full max-w-[90vw] bg-gray-100">
            <video
              ref={videoRef}
              src={videoSrc}
              // controls
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-auto max-h-[70vh] rounded-lg shadow-lg object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={togglePlayPause}
              onPlay={handlePlayStateChange}
              onPause={handlePlayStateChange}
            >
              Your browser does not support the video tag.
            </video>
            
            {/* Play/Pause Button - Bottom Left */}
            <button 
              className="absolute bottom-4 left-4 p-2 bg-white bg-opacity-70 hover:bg-opacity-100 rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering video container's click event
                togglePlayPause();
              }}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700 hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700 hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
            
            {/* Settings Button */}
            <button 
              className="absolute bottom-4 right-4 p-2 bg-white bg-opacity-70 hover:bg-opacity-100 rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering video play/pause
                videoRef.current?.pause();
                setSelectedSpeed(playbackSpeed); // Set the initially selected speed to current playback speed
                setShowSpeedModal(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700 hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          
          {/* Custom Timeline - Same width as video container */}
          <div className="w-full mt-2 min-w-[40vw] max-w-[90vw]">
            <div className="flex justify-between mb-1 text-sm">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div 
              className={`relative h-16 ${isSplitting ? 'bg-red-50' : 'bg-gray-200'} rounded w-full cursor-pointer`}
              onClick={handleTimelineClick}
            >
              {/* Slice Segments */}
              {slices.map((slice, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full bg-blue-200 hover:bg-blue-300 opacity-70 hover:opacity-80 transition-colors pointer-events-auto"
                  style={{
                    left: `${(slice.start / duration) * 100}%`,
                    width: `${((slice.end - slice.start) / duration) * 100}%`
                  }}
                />
              ))}
              
              {/* Current Time Cursor */}
              <div 
                className="absolute top-0 h-full w-1 bg-orange-500 hover:bg-orange-600 transition-colors z-10"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 1px)` }}
              />
              
              {/* Splitting Start Time Cursor */}
              {isSplitting && splittingStartTime !== null && (
                <div 
                  className="absolute top-0 h-full w-1 bg-blue-500 hover:bg-blue-600 transition-colors z-10"
                  style={{ left: `calc(${(splittingStartTime / duration) * 100}% - 1px)` }}
                />
              )}
              
              {/* Delete Slice Popup */}
              {showDeleteSlicePopup && (
                <div
                  className="absolute bg-white shadow-lg rounded-md p-3 z-20 border border-gray-300 cursor-default"
                  style={{ 
                    left: `${popupPosition}px`, 
                    top: '100%',
                    transform: calculateTransform(currentTime, duration),
                    marginTop: '8px'
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseOver={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-medium">Do you want to delete this slice?</p>
                  <div className="flex justify-between mt-2">
                      <button 
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSlices(
                            slices.filter(slice => currentTime < slice.start || currentTime > slice.end)
                          );
                          setShowDeleteSlicePopup(false);
                        }}
                      >
                        Yes
                      </button>
                      <button 
                        className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClosePopup();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                </div>
              )}
            </div>
            
            <div className="flex flex-row justify-center items-center mt-4 md:mt-8 gap-4">
              {!isSplitting && splittingStartTime === null && (
                <button 
                  onClick={() => {
                    videoRef.current?.pause();
                    setIsSplitting(true);
                    setSplittingStartTime(currentTime);
                    console.log("Start splitting at", formatTime(currentTime));
                    showSuccess("Slicing started, click on \"End Splitting\" to create your slice.");
                  }}
                  disabled={slices.some(slice => currentTime >= slice.start && currentTime <= slice.end)}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-md transition-colors ${
                    slices.some(slice => currentTime >= slice.start && currentTime <= slice.end)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-blue-700 cursor-pointer'
                  }`}
                >
                  Start Splitting
                </button>
              )}
              {isSplitting && splittingStartTime !== null && (
                <>
                  <button
                    onClick={() => {
                      videoRef.current?.pause();
                      if (splittingStartTime !== null) {
                        const newSlice = {
                          start: Math.min(splittingStartTime, currentTime),
                          end: Math.max(splittingStartTime, currentTime)
                        };
                        const hasOverlap = slices.some(slice => 
                          newSlice.start <= slice.end && slice.start <= newSlice.end
                        );
                        
                        if (hasOverlap) {
                          showError("Slices cannot have overlaps with each other");
                        } else {
                          // Check if the start and end of the new slice are at least 2 seconds apart
                          if (newSlice.end - newSlice.start < 2) {
                            showError("Slices must be at least 2 seconds apart");
                          } else {
                            setSlices([...slices, newSlice]);
                            console.log("Added slice:", formatTime(newSlice.start), "to", formatTime(newSlice.end));
                            showSliceCreatedSuccess();
                          }
                        }
                      }
                      setIsSplitting(false);
                      setSplittingStartTime(null);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                  >
                    End Splitting
                  </button>
                  <button 
                    onClick={() => {
                      videoRef.current?.pause();
                      setIsSplitting(false);
                      setSplittingStartTime(null);
                    }}
                    className="px-4 py-2 border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-colors cursor-pointer"
                  >
                    Cancel Splitting
                  </button>
                  
                </>
              )}
            </div>
            <div className="flex flex-row justify-center items-center mt-4 md:mt-8 gap-4">
              <button 
                  onClick={() => {
                    videoRef.current?.pause();
                    if (slices.length === 0) {
                      setShowNoSlicesToExportModal(true);
                    } else {
                      setShowVideoSizeWarningModal(true);
                    }
                  }}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-md transition-colors hover:bg-blue-700 cursor-pointer`}
                >
                  Export Slices
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format time in HH:MM:SS:MS format
const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return '00:00:00:000';
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`; 
}; 

const formatVideoSize = (fileSizeInBytes: number): string => {
  if (fileSizeInBytes >= 1024 * 1024 * 1024) {
    // For files >= 1GB
    const sizeInGB = Math.floor(fileSizeInBytes / (1024 * 1024 * 1024));
    const remainingBytes = fileSizeInBytes % (1024 * 1024 * 1024);
    const remainingMB = Math.round(remainingBytes / (1024 * 1024));
    return `${sizeInGB} GB and ${remainingMB} MB`;
  } else {
    // For files < 1GB
    const sizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
    return `${sizeInMB} MB`;
  }
};
