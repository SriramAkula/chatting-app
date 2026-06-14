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
import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

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

    private final SecureRandom random = new SecureRandom();

    public String generateAndSaveOtp(String email) {
        // Generate a 6-digit OTP code
        String otp = String.format("%06d", random.nextInt(1000000));
        String key = OTP_PREFIX + email;

        try {
            // Cache in Redis for 5 minutes
            redisTemplate.opsForValue().set(key, otp, OTP_EXPIRY_MINUTES, TimeUnit.MINUTES);
            logger.info("[OTP Generated] Saved OTP for {} in Redis. Expiry: {} minutes.", email, OTP_EXPIRY_MINUTES);
        } catch (Exception e) {
            logger.error("[Redis Failed] Failed to save OTP for {} in Redis. Exception: {}", email, e.getMessage(), e);
            throw e;
        }

        // Attempt to send email
        sendOtpEmail(email, otp);

        return otp;
    }

    public boolean verifyOtp(String email, String submittedOtp) {
        if (submittedOtp == null || submittedOtp.trim().isEmpty()) {
            return false;
        }

        String key = OTP_PREFIX + email;
        String cachedOtp = redisTemplate.opsForValue().get(key);

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
        String key = OTP_PREFIX + email;
        redisTemplate.delete(key);
        logger.info("[OTP Cleanup] Removed OTP from Redis for {}.", email);
    }

    private void sendOtpEmail(String email, String otp) {
        String subject = "AetherChat - Confirm Registration";

        if (mailSender == null) {
            logger.warn("[SMTP Offline] JavaMailSender is not initialized or configured. Displaying OTP in console fallback:");
            logger.info("========================================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("========================================");
            return;
        }

        try {
            // Render HTML email using Thymeleaf context
            Context context = new Context();
            context.setVariable("otp", otp);
            context.setVariable("expiryMinutes", OTP_EXPIRY_MINUTES);
            String htmlContent = templateEngine.process("otp-email", context);

            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(htmlContent, true);

            mailSender.send(mimeMessage);
            logger.info("[Email Sent] Beautiful HTML verification email successfully sent to {}.", email);
        } catch (Exception e) {
            logger.error("[Email Failed] Failed to send HTML email to {}. Exception: {}", email, e.getMessage());
            logger.info("================[ FALLBACK ]================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("============================================");
        }
    }
}
