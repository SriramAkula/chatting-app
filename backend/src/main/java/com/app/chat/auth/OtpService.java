package com.app.chat.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import jakarta.mail.internet.MimeMessage;
import jakarta.annotation.PostConstruct;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Service
public class OtpService {

    private static final Logger logger = LoggerFactory.getLogger(OtpService.class);
    private static final String OTP_PREFIX = "otp:register:";
    private static final int OTP_EXPIRY_MINUTES = 5;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Autowired
    private TemplateEngine templateEngine;

    @org.springframework.beans.factory.annotation.Value("${app.resend.api-key:}")
    private String resendApiKey;

    private final SecureRandom random = new SecureRandom();

    // In-memory OTP Cache Fallback
    private boolean useRedis = true;
    private final ConcurrentHashMap<String, OtpValue> inMemoryOtpMap = new ConcurrentHashMap<>();

    private static class OtpValue {
        final String otp;
        final LocalDateTime expiry;

        OtpValue(String otp, LocalDateTime expiry) {
            this.otp = otp;
            this.expiry = expiry;
        }

        boolean isExpired() {
            return LocalDateTime.now().isAfter(expiry);
        }
    }

    @PostConstruct
    public void init() {
        String renderPort = System.getenv("PORT");
        String redisUrl = System.getenv("REDIS_URL");
        String redisUri = System.getenv("REDIS_URI");

        // If running in Render production environment but no REDIS_URL/REDIS_URI is configured
        if (renderPort != null && !StringUtils.hasText(redisUrl) && !StringUtils.hasText(redisUri)) {
            useRedis = false;
            logger.warn("[OTP Service] Running in production without REDIS_URL/REDIS_URI. Falling back to secure local in-memory OTP storage.");
        } else {
            try {
                // Perform a quick ping/read to check if Redis is reachable
                redisTemplate.opsForValue().get("ping");
                useRedis = true;
                logger.info("[OTP Service] Redis is configured and online. Using Redis for OTP storage.");
            } catch (Exception e) {
                useRedis = false;
                logger.warn("[OTP Service] Redis connection failed. Falling back to secure local in-memory OTP storage. Exception: {}", e.getMessage());
            }
        }
    }

    public String generateAndSaveOtp(String email) {
        // Generate a 6-digit OTP code
        String otp = String.format("%06d", random.nextInt(1000000));
        String key = OTP_PREFIX + email;

        if (useRedis) {
            try {
                // Cache in Redis for 5 minutes
                redisTemplate.opsForValue().set(key, otp, OTP_EXPIRY_MINUTES, TimeUnit.MINUTES);
                logger.info("[OTP Generated] Saved OTP for {} in Redis. Expiry: {} minutes.", email, OTP_EXPIRY_MINUTES);
            } catch (Exception e) {
                logger.error("[Redis Failed] Failed to save OTP for {} in Redis. Exception: {}", email, e.getMessage(), e);
                throw e;
            }
        } else {
            // Cache in memory for 5 minutes
            LocalDateTime expiry = LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES);
            inMemoryOtpMap.put(email, new OtpValue(otp, expiry));
            logger.info("[OTP Generated] Saved OTP for {} in-memory. Expiry: {} minutes.", email, OTP_EXPIRY_MINUTES);
        }

        // Attempt to send email
        sendOtpEmail(email, otp);

        return otp;
    }

    public boolean verifyOtp(String email, String submittedOtp) {
        if (submittedOtp == null || submittedOtp.trim().isEmpty()) {
            return false;
        }

        String cachedOtp = null;

        if (useRedis) {
            String key = OTP_PREFIX + email;
            cachedOtp = redisTemplate.opsForValue().get(key);
        } else {
            OtpValue value = inMemoryOtpMap.get(email);
            if (value != null) {
                if (value.isExpired()) {
                    inMemoryOtpMap.remove(email);
                    logger.warn("[OTP Verification] In-memory OTP found but was expired for {}.", email);
                } else {
                    cachedOtp = value.otp;
                }
            }
        }

        if (cachedOtp == null) {
            logger.warn("[OTP Verification] No OTP found or expired for {}.", email);
            return false;
        }

        boolean isValid = cachedOtp.equals(submittedOtp.trim());
        if (isValid) {
            logger.info("[OTP Verification] Successfully verified OTP for {}.", email);
        } else {
            logger.warn("[OTP Verification] Incorrect OTP submitted for {}.", email);
        }

        return isValid;
    }

    public void deleteOtp(String email) {
        if (useRedis) {
            String key = OTP_PREFIX + email;
            redisTemplate.delete(key);
            logger.info("[OTP Cleanup] Removed OTP from Redis for {}.", email);
        } else {
            inMemoryOtpMap.remove(email);
            logger.info("[OTP Cleanup] Removed OTP from in-memory cache for {}.", email);
        }
    }

    private void sendOtpEmail(String email, String otp) {
        String subject = "AetherChat - Confirm Registration";

        // Render HTML email using Thymeleaf context
        String htmlContent;
        try {
            Context context = new Context();
            context.setVariable("otp", otp);
            context.setVariable("expiryMinutes", OTP_EXPIRY_MINUTES);
            htmlContent = templateEngine.process("otp-email", context);
        } catch (Exception e) {
            logger.error("[Template Failed] Failed to process Thymeleaf template. Error: {}", e.getMessage());
            htmlContent = "<h2>AetherChat Registration OTP</h2><p>Your verification code is: <strong>" + otp + "</strong></p>";
        }

        // 1. If Resend API Key is configured, use API-based HTTPS sending (Port 443)
        if (StringUtils.hasText(resendApiKey)) {
            try {
                RestTemplate restTemplate = new RestTemplate();
                
                // Configure headers
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.set("Authorization", "Bearer " + resendApiKey.trim());

                // Configure request payload map
                Map<String, Object> body = new HashMap<>();
                body.put("from", "AetherChat <onboarding@resend.dev>");
                body.put("to", Collections.singletonList(email));
                body.put("subject", subject);
                body.put("html", htmlContent);

                HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(body, headers);
                restTemplate.postForEntity("https://api.resend.com/emails", requestEntity, String.class);

                logger.info("[Email Sent] Beautiful HTML verification email successfully sent to {} via Resend API.", email);
                return;
            } catch (Exception e) {
                logger.error("[Resend API Failed] Failed to send email via Resend for {}. Exception: {}", email, e.getMessage());
                logger.info("================[ FALLBACK ]================");
                logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
                logger.info("============================================");
                return;
            }
        }

        // 2. Otherwise, fallback to SMTP Mail Sender
        if (mailSender == null) {
            logger.warn("[SMTP Offline] JavaMailSender is not initialized or configured. Displaying OTP in console fallback:");
            logger.info("========================================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("========================================");
            return;
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);

            mailSender.send(mimeMessage);
            logger.info("[Email Sent] Beautiful HTML verification email successfully sent to {} via SMTP.", email);
        } catch (Exception e) {
            logger.error("[SMTP Failed] Failed to send HTML email to {} via SMTP. Exception: {}", email, e.getMessage());
            logger.info("================[ FALLBACK ]================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("============================================");
        }
    }
}
