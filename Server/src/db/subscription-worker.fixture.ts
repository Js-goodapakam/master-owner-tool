// Child process for isolated acceptance. The real Owner app serves delivery.
if (process.env.NODE_ENV !== 'test' || !process.send ||
    new URL(process.env.SUPABASE_URL || '').hostname !== '127.0.0.1' ||
    new URL(process.env.ENGAGE_STAY_API_ORIGIN || '').hostname !== '127.0.0.1') {
  throw new Error('Loopback fixture with IPC required');
}
const { app } = await import('../app.js');
const server = app.listen(0, '127.0.0.1', () => {
  process.send?.((server.address() as { port: number }).port);
});
