package com.app.chat.config;

import io.lettuce.core.RedisURI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.util.StringUtils;

@Configuration
public class RedisConfig {

    @Value("${spring.data.redis.url:}")
    private String redisUrl;

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Value("${spring.data.redis.password:}")
    private String redisPassword;

    @Bean
    public LettuceConnectionFactory redisConnectionFactory() {
        if (StringUtils.hasText(redisUrl)) {
            RedisURI redisUri = RedisURI.create(redisUrl);
            RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
            config.setHostName(redisUri.getHost());
            config.setPort(redisUri.getPort());
            
            if (redisUri.getPassword() != null && redisUri.getPassword().length > 0) {
                config.setPassword(RedisPassword.of(redisUri.getPassword()));
            } else {
                config.setPassword(RedisPassword.none());
            }
            
            config.setDatabase(redisUri.getDatabase());
            
            org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration.LettuceClientConfigurationBuilder clientConfigBuilder = 
                    org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration.builder();
            if (redisUrl.startsWith("rediss://")) {
                clientConfigBuilder.useSsl().disablePeerVerification();
            }
            org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration clientConfig = clientConfigBuilder.build();
            
            return new LettuceConnectionFactory(config, clientConfig);
        }

        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
        config.setHostName(redisHost);
        config.setPort(redisPort);
        
        if (StringUtils.hasText(redisPassword)) {
            config.setPassword(RedisPassword.of(redisPassword));
        } else {
            config.setPassword(RedisPassword.none());
        }
        
        return new LettuceConnectionFactory(config);
    }
}
