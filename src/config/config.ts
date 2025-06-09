import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  wss_port: number;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  wss_port: Number(process.env.WSS_PORT),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export default config;