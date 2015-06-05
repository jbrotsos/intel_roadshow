
//Base class for a sensor reading source
template<class ReadingType>
class SensorReader {
public:
  typedef ReadingType TYPE;
  SensorReader(){}
  virtual TYPE readSample()=0; //get a single sample
  virtual void update()=0; //update any internal state
};

//Adaptor class for reading from an analog pin
template<class ReadingType>
class AnalogPinReader : public SensorReader<ReadingType> {
  int pin;
public:
  AnalogPinReader(int p) : pin(p) {}
  virtual ReadingType readSample(){return analogRead(pin);}
  virtual void update(){}
};

//Class that performs filtering on a 'noisy' data source.
//  Reads a sample every MILLIS_SAMPLE_DELAY, discarding any that are 2 standard deviations away from the rest of the frame,
//  and stops attempting to read new data after DEFAULT_BLOCKING_TIME. At that time, at most 10 valid samples have been read,
//  and they are all within 2 standard deviations.
template<class ReadingType, unsigned long MILLIS_SAMPLE_DELAY=10/*amount of time to wait between samples*/,unsigned long DEFAULT_BLOCKING_TIME=1000>
class NoisySensorReader : public SensorReader<ReadingType> {
  SensorReader<ReadingType>* sensor;
  static const int SAMPLE_BUFFER_LEN = 10;
  ReadingType sampleBuffer[SAMPLE_BUFFER_LEN];
  int num_valid_samples;
  unsigned long last_sample_time; //saved from millis()
  
  bool isValueAcceptable(ReadingType sample)
  {
    //find the mean
    double mean = sample;
    for(int i = 0; i < num_valid_samples; ++i)
    {
      mean += sampleBuffer[i];
    }
    mean /= (num_valid_samples+1);
    //subtract mean and square result - variance
    //find mean of variances
    double mean_of_variance = (sample-mean)*(sample-mean);
    for(int i = 0; i < num_valid_samples; ++i)
    {
      double variance = (sampleBuffer[i] - mean) * (sampleBuffer[i] - mean);
      mean_of_variance += variance;
    }
    mean_of_variance /= (num_valid_samples+1);
    //sqrt mean of variances - stddev
    double stddev = sqrt(mean_of_variance);
    //is the sample within 2 stddevs of mean?
    bool ret = ( mean-(2*stddev) <= sample && sample <= mean+(2*stddev) );
    return ret;
  }
  void shiftInValueToBuffer(ReadingType sample)
  {
    for(int i = SAMPLE_BUFFER_LEN-1; i > 0; --i)
    {
      sampleBuffer[i] = sampleBuffer[i-1];
    }
    sampleBuffer[0] = sample;
    if( num_valid_samples < SAMPLE_BUFFER_LEN )
      ++num_valid_samples;
  }
  void get_next_sample()
  {
    ReadingType sample = sensor->readSample();
    if( isValueAcceptable(sample) )
    {
      shiftInValueToBuffer(sample);
    }
  }
public:
  NoisySensorReader(SensorReader<ReadingType>* s) : sensor(s), num_valid_samples(0), last_sample_time(0)
  {
    for(int i = 0; i < SAMPLE_BUFFER_LEN; ++i)
      sampleBuffer[i] = 0;
  }
  virtual void update()
  {
    sensor->update();
    unsigned long now = millis();
    if( now > last_sample_time + MILLIS_SAMPLE_DELAY ) //recalc
    {
      last_sample_time = now;
      get_next_sample();
    }
  }
//polled read
  void startReading()
  {
    //reset the buffer
    if( num_valid_samples > 0 )
    {
      //use the last average as the seed for the new buffer frame
      sampleBuffer[0] = getReading();
      num_valid_samples = 1;
    }
  }
  bool isReadingFinished()
  {
    return (num_valid_samples >= SAMPLE_BUFFER_LEN); //the sample buffer is full
  }
  ReadingType getReading()
  {
    ReadingType ret = 0;
    for(int i = 0; i < num_valid_samples; ++i)
      ret += sampleBuffer[i];
    return (ret / num_valid_samples);
  }
//blocking read
  ReadingType getReadingBlocking(unsigned long timeout = DEFAULT_BLOCKING_TIME)
  {
    startReading();
    unsigned long now = millis();
    while(!isReadingFinished() && millis() < now + timeout)
    {
      update();
    }
    return getReading();
  }
//callback read - TODO
//SensorReader interface
  virtual ReadingType readSample(){return getReadingBlocking();}
};

//Class to take two sensors and perform a difference on the data streams.
template<class ReadingType>
class DifferentialSensorReader : public SensorReader<ReadingType> {
  SensorReader<ReadingType>* sensor1;
  SensorReader<ReadingType>* sensor2;
public:
  DifferentialSensorReader(SensorReader<ReadingType>* s1, SensorReader<ReadingType>* s2) : sensor1(s1), sensor2(s2) {}
  virtual ReadingType readSample(){return sensor1->readSample() - sensor2->readSample();}
  virtual void update()
  {
    sensor1->update();
    sensor2->update();
  }
};

//Class to take two sensors and perform an addition on the data streams.
template<class ReadingType>
class AdditiveSensorReader : public SensorReader<ReadingType> {
  SensorReader<ReadingType>* sensor1;
  SensorReader<ReadingType>* sensor2;
public:
  AdditiveSensorReader(SensorReader<ReadingType>* s1, SensorReader<ReadingType>* s2) : sensor1(s1), sensor2(s2) {}
  virtual ReadingType readSample(){return sensor1->readSample() + sensor2->readSample();}
  virtual void update()
  {
    sensor1->update();
    sensor2->update();
  }
};

//TESTING - create some sensor data streams!
AnalogPinReader<int> readerA0(A0);
AnalogPinReader<int> readerA1(A1);
NoisySensorReader<int,1,20> nsr1(&readerA0); //int sensor data, 1ms per sample, 20ms max timeout
NoisySensorReader<int,1,20> nsr2(&readerA1); //int sensor data, 1ms per sample, 20ms max timeout
DifferentialSensorReader<int> raw_difference(&nsr1, &nsr2);
NoisySensorReader<int,20,300> clean_difference(&raw_difference); //int sensor data, 20ms per sample, 300ms max timeout
AdditiveSensorReader<int> raw_additive(&nsr1, &nsr2);
NoisySensorReader<int,20,300> clean_additive(&raw_additive); //int sensor data, 20ms per sample, 300ms max timeout

  
void setup() {
  // initialize serial communications at 9600 bps:
  Serial.begin(115200); 
}

void loop() {
  nsr1.update();
  nsr2.update();
  clean_difference.update();
  //Serial.print("\t sensor1 filtered = ");
  //Serial.print(nsr1.getReading());
  //Serial.print("\t sensor2 filtered = ");
  //Serial.print(nsr2.getReading()); 
  //Serial.print("raw difference = ");
  //Serial.print(raw_difference.readSample());
  Serial.print("clean difference = ");
  Serial.print(clean_difference.readSample());
  Serial.print("\tclean sum = ");
  Serial.print(nsr1.getReading() + nsr2.getReading());
  Serial.println("");
}
