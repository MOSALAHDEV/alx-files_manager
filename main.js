// main.js
import redisClient from './utils/redis';

(async () => {
  // Test if Redis is alive
  console.log('Is Redis alive:', redisClient.isAlive()); // Should print true or false

  // Test setting a value
  await redisClient.set('myKey', 'myValue', 5);
  console.log('Set myKey with value myValue and expiry of 5 seconds');

  // Test getting the value
  console.log('Value of myKey:', await redisClient.get('myKey')); // Should print 'myValue'

  // Wait for 6 seconds to check if the value expires
  setTimeout(async () => {
    console.log('Value of myKey after 6 seconds:', await redisClient.get('myKey')); // Should print null
  }, 6000);
})();

