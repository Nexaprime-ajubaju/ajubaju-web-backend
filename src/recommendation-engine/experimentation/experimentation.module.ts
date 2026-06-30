import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Experiment, ExperimentSchema } from './schemas/experiment.schema';
import { ExperimentService } from './experiment.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Experiment.name, schema: ExperimentSchema },
    ]),
  ],
  providers: [ExperimentService],
  exports: [ExperimentService],
})
export class ExperimentationModule {}
