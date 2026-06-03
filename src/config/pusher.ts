import Pusher from 'pusher';
import { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } from '#utils/env.util';

const pusher = new Pusher({
  appId: PUSHER_APP_ID!,
  key: PUSHER_KEY!,
  secret: PUSHER_SECRET!,
  cluster: PUSHER_CLUSTER!,
  useTLS: true,
});

export default pusher;
