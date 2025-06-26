import Queue from 'bull';

const fileQueue = new Queue('thumbnail generation');
export default fileQueue;

