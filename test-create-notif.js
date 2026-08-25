const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { UsersService } = require('./dist/users/users.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  
  try {
    const notif = await usersService.createNotificationAndPush(
      "66f123456789012345678901", // random ObjectId
      "66f123456789012345678902", // senderId
      "Test User",
      "",
      "",
      "new_message",
      "Someone sent you a message: Hello",
      "New Message"
    );
    console.log("SUCCESS! Created notification:", notif);
  } catch (err) {
    console.error("ERROR CREATING NOTIFICATION:", err);
  }
  
  await app.close();
}

bootstrap();
