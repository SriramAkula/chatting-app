package com.app.chat.auth;

import com.app.chat.auth.dto.*;
import com.app.chat.security.JwtTokenProvider;
import com.app.chat.security.UserPrincipal;
import com.app.chat.user.*;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private OtpService otpService;

    @PostMapping("/register/request-otp")
    public ResponseEntity<?> requestOtp(@Valid @RequestBody RegisterRequest registerRequest) {
        if (userRepository.existsByEmail(registerRequest.getEmail())) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Email address already in use.");
        }

        if (userRepository.existsByDisplayName(registerRequest.getDisplayName())) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Display name already in use.");
        }

        try {
            otpService.generateAndSaveOtp(registerRequest.getEmail());
            return ResponseEntity.ok("Verification code sent to your email. It is valid for 5 minutes.");
        } catch (Exception e) {
            logger.error("Failed to generate/send OTP to {}", registerRequest.getEmail(), e);
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to send verification code. Details: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody VerifyOtpRequest verifyRequest) {
        if (userRepository.existsByEmail(verifyRequest.getEmail())) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Email address already in use.");
        }

        if (userRepository.existsByDisplayName(verifyRequest.getDisplayName())) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Display name already in use.");
        }

        // Verify OTP code
        boolean isOtpValid = otpService.verifyOtp(verifyRequest.getEmail(), verifyRequest.getOtp());
        if (!isOtpValid) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Invalid or expired OTP code.");
        }

        // OTP is correct, save new user's account
        User user = new User(
                verifyRequest.getEmail(),
                passwordEncoder.encode(verifyRequest.getPassword()),
                verifyRequest.getDisplayName(),
                null, 
                AuthProvider.LOCAL
        );

        userRepository.save(user);

        // Delete used OTP
        otpService.deleteOtp(verifyRequest.getEmail());

        return ResponseEntity.ok("User registered successfully");
    }

    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody LoginRequest loginRequest) {
        String email = loginRequest.getEmail();
        String password = loginRequest.getPassword();

        // 1. Manually check if user exists
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Please register to Login.");
        }

        // 2. Check if registered via OAuth2
        if (user.getAuthProvider() != AuthProvider.LOCAL) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Please login using your OAuth2 provider (Google).");
        }

        // 3. Check if password matches
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body("Incorrect password. Please try again.");
        }

        // Run Spring Security authentication manager
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        email,
                        password
                )
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        String jwt = tokenProvider.generateToken(authentication);
        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        
        UserResponse userResponse = new UserResponse(
                userPrincipal.getId(),
                userPrincipal.getEmail(),
                userPrincipal.getDisplayName(),
                userPrincipal.getAvatarUrl()
        );

        return ResponseEntity.ok(new AuthResponse(jwt, userResponse));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }
        UserResponse userResponse = new UserResponse(
                userPrincipal.getId(),
                userPrincipal.getEmail(),
                userPrincipal.getDisplayName(),
                userPrincipal.getAvatarUrl()
        );
        return ResponseEntity.ok(userResponse);
    }
}
