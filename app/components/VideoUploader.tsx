'use client';

import { useState, useEffect, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import ErrorModal from '@/app/components/modals/error';
import ProgressingModal from '@/app/components/modals/progress';
import OptionalInfoModal from '@/app/components/modals/optionalInfo';
import SuccessModal from '@/app/components/modals/success';
import PlaybackSpeedModal from '@/app/components/modals/playbackSpeed';
import WarningModal from '@/app/components/modals/warning';
import ExportSuccessModal from '@/app/components/modals/success/export';

// Add this type declaration at the top of your file, after your existing imports
declare module 'react' {
  interface VideoHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitplaysinline?: string;
  }
}

type Slice = {
  start: number;
  end: number;
}; 


export default function VideoUploader() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [popupPosition, setPopupPosition] = useState(0);
  const [isSlicing, setIsSlicing] = useState(false);
  const [slicingStartTime, setSlicingStartTime] = useState<number | null>(null);
  const [slices, setSlices] = useState<Slice[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showDeleteSlicePopup, setShowDeleteSlicePopup] = useState(false);
  const [errorModal, setErrorModal] = useState<{show: boolean, message: string}>({show: false, message: ""});
  const [sliceCreationInfoModal, setSliceCreationModal] = useState<{show: boolean, message: string}>({show: false, message: ""});
  const [sliceCreatedModal, setSliceCreatedModal] = useState<boolean>(false);
  const [hideSliceCreationModal, setHideSliceCreationModal] = useState<boolean>(false);
  const [showSpeedModal, setShowSpeedModal] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedSpeed, setSelectedSpeed] = useState<number>(1);
  const [showNoSlicesToExportModal, setShowNoSlicesToExportModal] = useState<boolean>(false);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [showVideoSizeWarningModal, setShowVideoSizeWarningModal] = useState<boolean>(false);
  const [showSlicingInProgressModal, setShowSlicingInProgressModal] = useState<boolean>(false);
  const [showExportSuccessModal, setShowExportSuccessModal] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);


  const sliceVideo = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) {
      showError("FFmpeg is not initialized. Please refresh the page and try again.");
      setShowSlicingInProgressModal(false);
      return;
    }

    if (!videoSrc) {
      showError("No video source found. Please upload a video first.");
      setShowSlicingInProgressModal(false);
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
      await Promise.all(slicePromises);
      
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
      setShowSlicingInProgressModal(false);
      setShowExportSuccessModal(true);
    } catch (error) {
      console.error('Error slicing video:', error);
      showError(`Error slicing video: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setShowSlicingInProgressModal(false);
    }
  };

  
  useEffect(() => {
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
    
    loadFFmpeg();
  }, []);  // No dependencies needed

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
        handleClosePopups();
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
      handleClosePopups();
      
      // Pause the video and update current time
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      
      // Show popup at click position with calculated transform
      setPopupPosition(clickPosition);
      
      if (!isSlicing) {
        // check if the clicked moment is inside a slice
        const isInsideSlice = slices.some(slice => 
          newTime >= slice.start && newTime <= slice.end
        );
        if (isInsideSlice) {
          setShowDeleteSlicePopup(true);
        }
      }
    }
  };

  const handleClosePopups = () => {
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

  // Add this function to show the slice created modal
  const showSliceCreatedSuccess = () => {
    setSliceCreatedModal(true);
  };

  // Apply the selected playback speed to the video
  const applyPlaybackSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
      // setShowSpeedChangedModal(true);
      // showSuccess(`Playback speed set to ${speed}x`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Slicing in Progress Modal */}
      <ProgressingModal 
        show={showSlicingInProgressModal}
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
      <OptionalInfoModal
        show={sliceCreationInfoModal.show}
        message={sliceCreationInfoModal.message}
        hideSuccessMessages={hideSliceCreationModal}
        onHideSuccessMessagesChange={setHideSliceCreationModal}
        onClose={() => setSliceCreationModal({show: false, message: ""})}
      />
      
      {/* Slice Created Success Modal */}
      <SuccessModal
        show={sliceCreatedModal}
        title="Slice Created!"
        description="Click on the slice if you want to delete it."
        onClose={() => setSliceCreatedModal(false)}
      />
      
      {/* Playback Speed Modal */}
      <PlaybackSpeedModal
        show={showSpeedModal}
        selectedSpeed={selectedSpeed}
        onSpeedChange={setSelectedSpeed}
        onApply={() => {
          applyPlaybackSpeed(selectedSpeed);
          setShowSpeedModal(false);
        }}
        onCancel={() => {
          setSelectedSpeed(playbackSpeed);
          setShowSpeedModal(false);
        }}
      />


      <ErrorModal
        show={showNoSlicesToExportModal}
        // title="No Slices Available"
        message="There are no slices to export! Create some slices first then export them."
        onClose={() => setShowNoSlicesToExportModal(false)}
      />


      <ExportSuccessModal
        show={showExportSuccessModal}
        title="Export Success"
        description={`Successfully exported ${slices.length} slice${slices.length > 1 ? 's' : ''} in a zip file! Check your browser's downloads.`}
        onClose={() => setShowExportSuccessModal(false)}
      />


      {videoSize && (
        <WarningModal
          show={showVideoSizeWarningModal}
          title=""
          description={`Your video's file size is ${formatVideoSize(videoSize)}. Please make sure you have at least (2 * [${formatVideoSize(videoSize)}] = ${formatVideoSize(videoSize * 2)}) available memory on your device before proceeding; otherwise, you might get errors.`}
          onClose={() => setShowVideoSizeWarningModal(false)}
          onConfirm={async () => {
            setShowVideoSizeWarningModal(false);
            setShowSlicingInProgressModal(true);
            await sliceVideo();
          }}
          confirmText="Continue slicing the video"
          showCancel
        />
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
            className="flex flex-col items-center justify-center w-full max-w-2xl h-64 md:h-80 lg:h-96 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors cursor-pointer mx-auto p-6"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-24 w-24 md:h-32 md:w-32 mb-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" 
              />
            </svg>
            <span className="text-2xl md:text-3xl text-center">Upload your video to start</span>
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
              playsInline
              webkitplaysinline=""
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16m6-16v16" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700 hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5.5L19 12L5 18.5V5.5z" />
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
              className={`relative h-16 ${isSlicing ? 'bg-red-50' : 'bg-gray-200'} rounded w-full cursor-pointer`}
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
              
              {/* Slicing Start Time Cursor */}
              {isSlicing && slicingStartTime !== null && (
                <div 
                  className="absolute top-0 h-full w-1 bg-blue-500 hover:bg-blue-600 transition-colors z-10"
                  style={{ left: `calc(${(slicingStartTime / duration) * 100}% - 1px)` }}
                />
              )}
              
              {/* Delete Slice Popup */}
              {showDeleteSlicePopup && (
                <div
                  className="absolute bg-white dark:bg-gray-800 shadow-lg rounded-md p-3 z-20 border border-gray-300 dark:border-gray-700 cursor-default"
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
                          handleClosePopups();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                </div>
              )}
            </div>
            
            <div className="flex flex-row justify-center items-center mt-4 md:mt-8 gap-4">
              {!isSlicing && slicingStartTime === null && (
                <button 
                  onClick={() => {
                    videoRef.current?.pause();
                    setIsSlicing(true);
                    setSlicingStartTime(currentTime);
                    console.log("Start slicing at", formatTime(currentTime));
                    if (!hideSliceCreationModal) {
                      setSliceCreationModal({show: true, message: "Slicing started, select the end of the slice and click on \"End Slicing\" button to create your slice. Click on \"Cancel Slicing\" to cancel the slicing process."});
                    }
                  }}
                  disabled={slices.some(slice => currentTime >= slice.start && currentTime <= slice.end)}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-md transition-colors ${
                    slices.some(slice => currentTime >= slice.start && currentTime <= slice.end)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-blue-700 cursor-pointer'
                  }`}
                >
                  Start a new Slice
                </button>
              )}
              {isSlicing && slicingStartTime !== null && (
                <>
                  <button
                    onClick={() => {
                      videoRef.current?.pause();
                      if (slicingStartTime !== null) {
                        const newSlice = {
                          start: Math.min(slicingStartTime, currentTime),
                          end: Math.max(slicingStartTime, currentTime)
                        };
                        const hasOverlap = slices.some(slice => 
                          newSlice.start <= slice.end && slice.start <= newSlice.end
                        );
                        
                        if (hasOverlap) {
                          showError("Slices cannot have overlaps with each other");
                        } else {
                          if (newSlice.end - newSlice.start < 2) {
                            showError("Slices must be at least 2 seconds");
                          } else {
                            setSlices([...slices, newSlice]);
                            console.log("Added slice:", formatTime(newSlice.start), "to", formatTime(newSlice.end));
                            showSliceCreatedSuccess();
                            setIsSlicing(false);
                            setSlicingStartTime(null);
                          }
                        }
                      }

                    }}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                  >
                    End Slicing
                  </button>
                  <button 
                    onClick={() => {
                      videoRef.current?.pause();
                      setIsSlicing(false);
                      setSlicingStartTime(null);
                    }}
                    className="px-4 py-2 border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-colors cursor-pointer"
                  >
                    Cancel Slicing
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
