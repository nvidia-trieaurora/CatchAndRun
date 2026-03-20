import { ClientMessage } from "@catch-and-run/shared";

export type VoiceMode = "team" | "all" | "mute";

interface PeerConnection {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  role: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class VoiceChat {
  private peers = new Map<string, PeerConnection>();
  private localStream: MediaStream | null = null;
  private micEnabled = false;
  private mode: VoiceMode = "all";
  private myRole = "";
  private sendSignal: (data: any) => void;
  onMicChange: ((enabled: boolean) => void) | null = null;
  onModeChange: ((mode: VoiceMode) => void) | null = null;
  onPeerSpeaking: ((sessionId: string, speaking: boolean) => void) | null = null;

  constructor(sendSignal: (data: any) => void) {
    this.sendSignal = sendSignal;
  }

  async requestMic(): Promise<boolean> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
      this.micEnabled = false;
      return true;
    } catch {
      console.warn("[VoiceChat] Mic access denied");
      return false;
    }
  }

  async connectToPeer(sessionId: string, initiator: boolean) {
    if (this.peers.has(sessionId)) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    audio.autoplay = true;

    this.peers.set(sessionId, { pc, audio, role: "" });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      this.applyModeFilter(sessionId);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal({
          type: ClientMessage.VOICE_SIGNAL,
          data: { targetSessionId: sessionId, type: "ice", payload: e.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.disconnectPeer(sessionId);
      }
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal({
        type: ClientMessage.VOICE_SIGNAL,
        data: { targetSessionId: sessionId, type: "offer", payload: offer },
      });
    }
  }

  async handleSignal(fromSessionId: string, type: string, payload: any) {
    let peer = this.peers.get(fromSessionId);

    if (!peer && type === "offer") {
      await this.connectToPeer(fromSessionId, false);
      peer = this.peers.get(fromSessionId);
    }
    if (!peer) return;

    const { pc } = peer;

    if (type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({
        type: ClientMessage.VOICE_SIGNAL,
        data: { targetSessionId: fromSessionId, type: "answer", payload: answer },
      });
    } else if (type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
    } else if (type === "ice") {
      await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {});
    }
  }

  toggleMic(): boolean {
    this.micEnabled = !this.micEnabled;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = this.micEnabled; });
    }
    this.onMicChange?.(this.micEnabled);
    return this.micEnabled;
  }

  setMicEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
    }
    this.onMicChange?.(enabled);
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  cycleMode(): VoiceMode {
    const modes: VoiceMode[] = ["all", "team", "mute"];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    this.applyModeToAllPeers();
    this.onModeChange?.(this.mode);
    return this.mode;
  }

  getMode(): VoiceMode {
    return this.mode;
  }

  setMyRole(role: string) {
    this.myRole = role;
    this.applyModeToAllPeers();
  }

  setPeerRole(sessionId: string, role: string) {
    const peer = this.peers.get(sessionId);
    if (peer) {
      peer.role = role;
      this.applyModeFilter(sessionId);
    }
  }

  updateRoles(myRole: string, peerRoles: Map<string, string>) {
    this.myRole = myRole;
    peerRoles.forEach((role, sid) => {
      const peer = this.peers.get(sid);
      if (peer) peer.role = role;
    });
    this.applyModeToAllPeers();
  }

  private applyModeToAllPeers() {
    this.peers.forEach((_peer, sid) => this.applyModeFilter(sid));
  }

  private applyModeFilter(sessionId: string) {
    const peer = this.peers.get(sessionId);
    if (!peer) return;

    if (this.mode === "mute") {
      peer.audio.volume = 0;
    } else if (this.mode === "team") {
      peer.audio.volume = (peer.role && peer.role === this.myRole) ? 1 : 0;
    } else {
      peer.audio.volume = 1;
    }
  }

  disconnectPeer(sessionId: string) {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    this.peers.delete(sessionId);
  }

  dispose() {
    this.peers.forEach((_p, sid) => this.disconnectPeer(sid));
    this.peers.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.micEnabled = false;
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  isConnected(sessionId: string): boolean {
    return this.peers.has(sessionId);
  }
}
