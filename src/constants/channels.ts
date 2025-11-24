const WS_CHANNELS = {
  chat: {
    broadCastSend: 'chat:broadcast:send',
    broadCastRecive: 'chat:broadcast:receive',
  },
  stream: {
    push: 'stream:push',
    error: 'stream:error',
  },
  transition: {
    ready: 'transition:ready',
    open: 'transition:open',
    break: 'transition:break',
    close: 'transition:close',
    broadCast: {
      ready: 'transition:broadcast:ready',
      open: 'transition:broadcast:open',
      break: 'transition:broadcast:break',
      close: 'transition:broadcast:close',
    },
  },
};

export default WS_CHANNELS;
