"use client";

import { useEffect, useRef, useState } from 'react';
import LiquidGlassContainer from './LiquidGlassContainer';

type ChatMsg = { id: string; sender?: string; text: string; ts: number };

export default function WatchPartyPanel() {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [connected, setConnected] = useState(false);
  const [followHost, setFollowHost] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');

  const esRef = useRef<EventSource | null>(null);
  const selfIdRef = useRef<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const suppressRef = useRef<boolean>(false);

  useEffect(() => {
    selfIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const getVideo = (): HTMLVideoElement | null => {
    if (videoRef.current && document.contains(videoRef.current)) return videoRef.current;
    const v = document.querySelector('video');
    videoRef.current = v as HTMLVideoElement | null;
    return videoRef.current;
  };

  const emit = (type: string, payload: Record<string, unknown>) => {
    if (!room) return;
    fetch('/api/watchparty/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, type, sender: selfIdRef.current, payload })
    }).catch(() => {});
  };

  const connect = () => {
    if (!room) return;
    disconnect();
    const es = new EventSource(`/api/watchparty/events?room=${encodeURIComponent(room)}`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data) return;
        if (data.type === 'playback' && followHost) {
          if (data.sender === selfIdRef.current) return;
          const v = getVideo();
          if (!v) return;
          suppressRef.current = true;
          if (typeof data.payload?.time === 'number') {
            v.currentTime = data.payload.time;
          }
          if (data.payload?.state === 'play') {
            void v.play();
          } else if (data.payload?.state === 'pause') {
            v.pause();
          }
          setTimeout(() => (suppressRef.current = false), 300);
        } else if (data.type === 'presence') {
          const memberName = (data.payload?.name as string) || '未知用户';
          if (data.payload?.action === 'join') {
            setMembers((prev) => (prev.includes(memberName) ? prev : [...prev, memberName]));
          } else if (data.payload?.action === 'leave') {
            setMembers((prev) => prev.filter((m) => m !== memberName));
          }
        } else if (data.type === 'chat') {
          const msg: ChatMsg = {
            id: `${data.ts}-${Math.random().toString(36).slice(2, 6)}`,
            sender: data.sender,
            text: String(data.payload?.text || ''),
            ts: data.ts || Date.now()
          };
          setMessages((prev) => [...prev.slice(-50), msg]);
        }
      } catch {}
    };
    es.onerror = () => {
      // 浏览器自动重连
    };
    esRef.current = es;
    setConnected(true);
    // 广播加入
    emit('presence', { action: 'join', name });
    ensureVideoListeners();
  };

  const disconnect = () => {
    if (connected) {
      emit('presence', { action: 'leave', name });
    }
    esRef.current?.close();
    esRef.current = null;
    setConnected(false);
  };

  const ensureVideoListeners = () => {
    const v = getVideo();
    if (!v) return;
    const onPlay = () => {
      if (suppressRef.current) return;
      emit('playback', { state: 'play', time: v.currentTime });
    };
    const onPause = () => {
      if (suppressRef.current) return;
      emit('playback', { state: 'pause', time: v.currentTime });
    };
    const onSeeked = () => {
      if (suppressRef.current) return;
      emit('playback', { state: 'seek', time: v.currentTime });
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);
  };

  const sendChat = () => {
    if (!chatText.trim()) return;
    emit('chat', { text: chatText.trim(), name });
    setChatText('');
  };

  return (
    <div className='space-y-3'>
      <LiquidGlassContainer className='px-3 py-2 flex items-center gap-2' roundedClass='rounded-full' intensity='medium' shadow='lg' border='subtle'>
        <span className='text-xs font-semibold text-gray-700 dark:text-gray-200'>一起观看</span>
        <input value={room} onChange={(e) => setRoom(e.target.value.trim())} placeholder='房间号' className='text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60' />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder='昵称' className='text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60' />
        {!connected ? (
          <button onClick={connect} className='text-xs px-3 py-1 rounded-full bg-green-600 text-white hover:bg-green-700'>加入</button>
        ) : (
          <button onClick={disconnect} className='text-xs px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-700'>离开</button>
        )}
        <label className='flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300'>
          <input type='checkbox' checked={followHost} onChange={(e) => setFollowHost(e.target.checked)} />
          跟随主机
        </label>
        <span className='ml-auto text-xs text-gray-600 dark:text-gray-400'>成员：{members.length}</span>
      </LiquidGlassContainer>

      <LiquidGlassContainer className='px-3 py-2' roundedClass='rounded-2xl' intensity='medium' shadow='lg' border='subtle'>
        <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
          <div className='md:col-span-1'>
            <div className='text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2'>在线成员</div>
            <ul className='space-y-1'>
              {members.length === 0 && <li className='text-xs text-gray-500 dark:text-gray-400'>暂无成员</li>}
              {members.map((m, i) => (
                <li key={`${m}-${i}`} className='text-xs text-gray-800 dark:text-gray-100'>{m}</li>
              ))}
            </ul>
          </div>
          <div className='md:col-span-3'>
            <div className='text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2'>聊天</div>
            <div className='h-32 overflow-y-auto rounded-md bg-white/50 dark:bg-gray-800/50 border border-white/20 dark:border-gray-700/40 p-2'>
              {messages.length === 0 && <div className='text-xs text-gray-500 dark:text-gray-400'>暂无消息</div>}
              {messages.map((msg) => (
                <div key={msg.id} className='text-xs text-gray-800 dark:text-gray-100'>
                  <span className='font-semibold'>{msg.sender ? String(msg.sender).slice(0, 6) : '匿名'}</span>: {msg.text}
                </div>
              ))}
            </div>
            <div className='mt-2 flex items-center gap-2'>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder='输入消息' className='flex-1 text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60' />
              <button onClick={sendChat} className='text-xs px-3 py-1 rounded-full bg-blue-600 text-white hover:bg-blue-700'>发送</button>
            </div>
          </div>
        </div>
      </LiquidGlassContainer>
    </div>
  );
}