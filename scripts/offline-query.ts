import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@libsql/client';
(async () => {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN });
  const i = await client.execute('SELECT id, work_id, image_url, media_type FROM work_images ORDER BY work_id, sort_order');
  const types: Record<string,number> = {};
  for (const r of i.rows as any[]) types[r.media_type] = (types[r.media_type]||0)+1;
  console.log('media types', types);
  const videos = (i.rows as any[]).filter(r => r.media_type === 'video').slice(0,5);
  console.log(JSON.stringify(videos,null,2));
})();
