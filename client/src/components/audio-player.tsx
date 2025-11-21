import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Clock, Gauge } from "lucide-react";
import type { Episode } from "@shared/schema";

interface AudioPlayerProps {
  episode: Episode;
  podcastTitle?: string;
  podcastCover?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ episode, podcastTitle, podcastCover }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [jumpDialogOpen, setJumpDialogOpen] = useState(false);
  const [jumpMinutes, setJumpMinutes] = useState("");
  const [jumpSeconds, setJumpSeconds] = useState("");
  const listenedThresholdReached = useRef(false);

  // Mark episode as listened when 80% is reached
  useEffect(() => {
    if (duration > 0 && currentTime / duration >= 0.8 && !listenedThresholdReached.current) {
      listenedThresholdReached.current = true;
      try {
        const data = localStorage.getItem("listened-episodes");
        const listened: string[] = data ? JSON.parse(data) : [];
        if (!listened.includes(episode.id)) {
          listened.push(episode.id);
          localStorage.setItem("listened-episodes", JSON.stringify(listened));
          // Dispatch custom event to notify other components
          window.dispatchEvent(new CustomEvent("episode-listened", { detail: { episodeId: episode.id } }));
        }
      } catch (error) {
        console.error("Error saving listened episode:", error);
      }
    }
  }, [currentTime, duration, episode.id]);

  // Reset threshold when episode changes
  useEffect(() => {
    listenedThresholdReached.current = false;
  }, [episode.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const skipForward = () => {
    if (audioRef.current) {
      const newTime = Math.min(audioRef.current.currentTime + 15, duration);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skipBackward = () => {
    if (audioRef.current) {
      const newTime = Math.max(audioRef.current.currentTime - 15, 0);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleJumpToTime = () => {
    const mins = parseInt(jumpMinutes) || 0;
    const secs = parseInt(jumpSeconds) || 0;
    const totalSeconds = (mins * 60) + secs;
    
    if (audioRef.current && totalSeconds >= 0 && totalSeconds <= duration) {
      audioRef.current.currentTime = totalSeconds;
      setCurrentTime(totalSeconds);
      setJumpDialogOpen(false);
      setJumpMinutes("");
      setJumpSeconds("");
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-card-border z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <audio ref={audioRef} src={episode.audioUrl || undefined} data-testid="audio-player" />

        {/* Progress Bar */}
        <div className="mb-3">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="cursor-pointer"
            data-testid="slider-progress"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span data-testid="text-current-time">{formatTime(currentTime)}</span>
            <span data-testid="text-duration">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Cover & Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {podcastCover && (
              <img
                src={podcastCover}
                alt={podcastTitle || "Podcast"}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm line-clamp-1" data-testid="text-player-episode-title">
                {episode.title}
              </p>
              {podcastTitle && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {podcastTitle}
                </p>
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Skip Backward */}
            <Button
              variant="ghost"
              size="icon"
              onClick={skipBackward}
              className="h-8 w-8"
              data-testid="button-skip-backward"
              title="Retroceder 15s"
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="icon"
              onClick={togglePlay}
              className="h-10 w-10 rounded-full"
              data-testid="button-play-pause"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </Button>

            {/* Skip Forward */}
            <Button
              variant="ghost"
              size="icon"
              onClick={skipForward}
              className="h-8 w-8"
              data-testid="button-skip-forward"
              title="Avanzar 15s"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Advanced Controls */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {/* Playback Speed */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" data-testid="button-playback-speed">
                  <Gauge className="h-3 w-3" />
                  <span className="text-xs">{playbackRate}x</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => changePlaybackRate(0.5)} data-testid="menu-speed-0.5">
                  0.5x
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changePlaybackRate(0.75)} data-testid="menu-speed-0.75">
                  0.75x
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changePlaybackRate(1)} data-testid="menu-speed-1">
                  Normal (1x)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changePlaybackRate(1.25)} data-testid="menu-speed-1.25">
                  1.25x
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changePlaybackRate(1.5)} data-testid="menu-speed-1.5">
                  1.5x
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changePlaybackRate(2)} data-testid="menu-speed-2">
                  2x
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Jump to Time */}
            <Dialog open={jumpDialogOpen} onOpenChange={setJumpDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-jump-to-time" title="Ir a minuto específico">
                  <Clock className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ir a Tiempo Específico</DialogTitle>
                  <DialogDescription>
                    Introduce el tiempo al que deseas saltar
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-4 py-4">
                  <div className="flex-1">
                    <Label htmlFor="jump-minutes" className="text-sm mb-2 block">
                      Minutos
                    </Label>
                    <Input
                      id="jump-minutes"
                      type="number"
                      min="0"
                      max={Math.floor(duration / 60)}
                      value={jumpMinutes}
                      onChange={(e) => setJumpMinutes(e.target.value)}
                      placeholder="0"
                      data-testid="input-jump-minutes"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="jump-seconds" className="text-sm mb-2 block">
                      Segundos
                    </Label>
                    <Input
                      id="jump-seconds"
                      type="number"
                      min="0"
                      max="59"
                      value={jumpSeconds}
                      onChange={(e) => setJumpSeconds(e.target.value)}
                      placeholder="0"
                      data-testid="input-jump-seconds"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setJumpDialogOpen(false)} data-testid="button-cancel-jump">
                    Cancelar
                  </Button>
                  <Button onClick={handleJumpToTime} data-testid="button-confirm-jump">
                    Ir
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Volume Controls */}
          <div className="hidden md:flex items-center gap-2 w-32 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="h-8 w-8"
              data-testid="button-mute"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              className="flex-1"
              data-testid="slider-volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
