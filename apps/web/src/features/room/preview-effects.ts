import { useEffect, useRef, useState } from "react";

import type { RequestedMedia } from "@lowtime/shared";

import { startPreviewRequest } from "./room-actions.js";
import { stopMediaStream, type PreviewState } from "../../device-preview.js";
import type { ViewState } from "../../room-entry.js";

const DEFAULT_REQUESTED_MEDIA: RequestedMedia = {
  audio: true,
  video: true,
};

interface UseDevicePreviewInput {
  viewState: ViewState;
}

export function useDevicePreview(input: UseDevicePreviewInput) {
  const [previewAudioEnabled, setPreviewAudioEnabled] = useState(DEFAULT_REQUESTED_MEDIA.audio);
  const [previewVideoEnabled, setPreviewVideoEnabled] = useState(DEFAULT_REQUESTED_MEDIA.video);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (input.viewState.kind === "room" || input.viewState.kind === "waiting") {
      return;
    }

    setPreviewAudioEnabled(DEFAULT_REQUESTED_MEDIA.audio);
    setPreviewVideoEnabled(DEFAULT_REQUESTED_MEDIA.video);
    setPreviewState("idle");
    setPreviewError(null);
    stopMediaStream(previewStreamRef.current);
    previewStreamRef.current = null;
  }, [input.viewState]);

  useEffect(() => {
    const videoElement = previewVideoRef.current;
    const stream = previewStreamRef.current;

    if (videoElement == null) {
      return;
    }

    videoElement.srcObject = stream;

    return () => {
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
    };
  }, [previewState, previewVideoEnabled]);

  useEffect(() => {
    return () => {
      stopMediaStream(previewStreamRef.current);
      previewStreamRef.current = null;
    };
  }, []);

  async function handleStartPreview() {
    setPreviewState("requesting");
    setPreviewError(null);

    try {
      const stream = await startPreviewRequest({
        audio: previewAudioEnabled,
        video: previewVideoEnabled,
      });
      stopMediaStream(previewStreamRef.current);
      previewStreamRef.current = stream;
      setPreviewState("ready");
    } catch (error) {
      stopMediaStream(previewStreamRef.current);
      previewStreamRef.current = null;

      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPreviewState("blocked");
        setPreviewError("Camera or microphone access was blocked. Adjust browser permissions to preview devices.");
      } else {
        setPreviewState("error");
        setPreviewError(error instanceof Error ? error.message : "Unable to start device preview.");
      }
    }
  }

  function clearPreview() {
    stopMediaStream(previewStreamRef.current);
    previewStreamRef.current = null;
  }

  return {
    clearPreview,
    requestedMedia: {
      audio: previewAudioEnabled,
      video: previewVideoEnabled,
    },
    handleStartPreview,
    previewAudioEnabled,
    previewError,
    previewState,
    previewVideoEnabled,
    previewVideoRef,
    setPreviewAudioEnabled,
    setPreviewVideoEnabled,
  };
}
