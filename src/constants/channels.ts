const WS_CHANNELS = {
  chat: {
    broadCastSend: 'chat:broadcast:send',
    broadCastRecive: 'chat:broadcast:receive',
  },
  stream: {
    push: 'stream:push',
  },
  transition: {
    open: 'transition:open',
    break: 'transition:break',
    broadCast: {
      open: 'transition:broadcast:open',
      break: 'transition:broadcast:break'
    }
  }
};

export default WS_CHANNELS;
