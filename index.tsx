import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

const LOADING_MESSAGES = [
  "Warming up the digital director...",
  "Setting up the virtual cameras...",
  "Adjusting the lighting and composition...",
  "Rendering the first few frames...",
  "This can take a few minutes, please be patient.",
  "Adding special effects and sound...",
  "Finalizing the video masterpiece...",
];

const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<{data: string; mimeType: string} | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [resolution, setResolution] = useState('720p');
  
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: number;
    if (loading) {
      let messageIndex = 0;
      interval = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
        setLoadingMessage(LOADING_MESSAGES[messageIndex]);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (imagePreview) {
          URL.revokeObjectURL(imagePreview);
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImage({ data: base64String, mimeType: file.type });
        setImagePreview(URL.createObjectURL(file));
      };
      reader.readAsDataURL(file);
    }
  };
  
  const removeImage = () => {
      if (imagePreview) {
          URL.revokeObjectURL(imagePreview);
      }
      setImage(null);
      setImagePreview(null);
  }

  const generateVideo = useCallback(async () => {
    if (!apiKey) {
      setError("Please enter your Google API Key.");
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please enter a prompt.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let requestPayload: any = {
        model: 'veo-2.0-generate-001',
        config: {
          numberOfVideos: 1,
          // Note: The API docs provided do not explicitly list aspect ratio, sound, or resolution
          // as configurable parameters for 'veo-2.0-generate-001'.
          // These are included as illustrative UI elements per the request.
        }
      };

      // Try to parse the prompt as JSON
      if (trimmedPrompt.startsWith('{') && trimmedPrompt.endsWith('}')) {
        try {
          const userJsonPayload = JSON.parse(trimmedPrompt);
          // Merge user JSON, giving it precedence over defaults
          requestPayload = { ...requestPayload, ...userJsonPayload };
        } catch (jsonError) {
          setError("Malformed JSON in the prompt field. Please correct it or use plain text.");
          setLoading(false);
          return;
        }
      } else {
        // Treat as a simple string prompt
        requestPayload.prompt = trimmedPrompt;
      }
      
      if (image) {
        requestPayload.image = {
          imageBytes: image.data,
          mimeType: image.mimeType,
        };
      }

      // Final check to ensure a prompt exists either from plain text or JSON
      if (!requestPayload.prompt) {
        setError("A 'prompt' string must be provided, either as plain text or within the JSON object.");
        setLoading(false);
        return;
      }

      let operation = await ai.models.generateVideos(requestPayload);

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      if (operation.response?.generatedVideos?.[0]?.video?.uri) {
        const downloadLink = operation.response.generatedVideos[0].video.uri;
        const videoResponse = await fetch(`${downloadLink}&key=${apiKey}`);
        
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const videoBlob = await videoResponse.blob();
        const url = URL.createObjectURL(videoBlob);
        setVideoUrl(url);

      } else {
        throw new Error("Video generation completed, but no video URI was found.");
      }

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during video generation.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, prompt, image, aspectRatio, soundEnabled, resolution]);
  
  const handleDownload = () => {
      if (videoUrl) {
          const a = document.createElement('a');
          a.href = videoUrl;
          a.download = 'veo-generated-video.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }
  }

  return (
    <div className="container">
      <h1>VEO Video Generator</h1>
      
      <div className="form-group">
        <label htmlFor="api-key">Google API Key</label>
        <input 
          id="api-key"
          type="password"
          value={apiKey} 
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your Google API Key"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="prompt">Prompt (Text or JSON)</label>
        <textarea 
          id="prompt"
          value={prompt} 
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='A neon hologram of a cat driving at top speed...\n\nOr use JSON:\n{\n  "prompt": "your prompt here",\n  "config": { "numberOfVideos": 1 }\n}'
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label>Reference Image (Optional)</label>
        <div className="file-input-container">
            <label htmlFor="file-upload" className="btn btn-secondary">
                Upload Image
            </label>
            <input id="file-upload" type="file" accept="image/*" onChange={handleImageUpload} disabled={loading}/>
            {imagePreview && (
                <div className="image-preview">
                    <img src={imagePreview} alt="Reference preview" />
                    <button onClick={removeImage} disabled={loading}>&times;</button>
                </div>
            )}
        </div>
      </div>
      
      <div className="options-grid">
        <div className="form-group">
          <label>Aspect Ratio</label>
          <div className="segmented-control">
            <button className={aspectRatio === '16:9' ? 'active' : ''} onClick={() => setAspectRatio('16:9')} disabled={loading}>16:9</button>
            <button className={aspectRatio === '9:16' ? 'active' : ''} onClick={() => setAspectRatio('9:16')} disabled={loading}>9:16</button>
          </div>
        </div>
        
        <div className="form-group">
          <label>Resolution</label>
          <div className="segmented-control">
            <button className={resolution === '720p' ? 'active' : ''} onClick={() => setResolution('720p')} disabled={loading}>720p</button>
            <button className={resolution === '1080p' ? 'active' : ''} onClick={() => setResolution('1080p')} disabled={loading}>1080p</button>
          </div>
        </div>
        
        <div className="form-group">
            <label>Sound</label>
            <div className="switch-control">
                 <label className="switch">
                    <input type="checkbox" checked={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} disabled={loading} />
                    <span className="slider"></span>
                </label>
                <span>{soundEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
        </div>
      </div>
      <p className="disclaimer">Note: Aspect Ratio, Resolution, and Sound options are for UI demonstration purposes.</p>


      <button className="btn btn-primary" onClick={generateVideo} disabled={loading || !prompt || !apiKey}>
        {loading ? 'Generating...' : 'Generate Video'}
      </button>

      {error && <p className="error-message">{error}</p>}
      
      {loading && (
        <div className="loading-section">
          <div className="loading-spinner"></div>
          <p>{loadingMessage}</p>
        </div>
      )}
      
      {videoUrl && !loading && (
        <div className="output-section">
          <h2>Your Video</h2>
          <video src={videoUrl} controls autoPlay muted loop playsInline></video>
          <button className="btn btn-secondary" onClick={handleDownload}>Download Video</button>
        </div>
      )}
      
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);