package com.app.chat.user;

import com.app.chat.auth.dto.UserResponse;
import com.app.chat.security.UserPrincipal;
import com.app.chat.user.dto.UpdateProfileRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(
            @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found");
        }

        // 1. Update Display Name if provided and changed
        if (request.getDisplayName() != null && !request.getDisplayName().trim().isEmpty()) {
            String newDisplayName = request.getDisplayName().trim();
            
            // Only validate if they are actually changing their display name
            if (!newDisplayName.equals(user.getDisplayName())) {
                Optional<User> existingUser = userRepository.findByDisplayName(newDisplayName);
                if (existingUser.isPresent()) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Display name is already taken.");
                }
                user.setDisplayName(newDisplayName);
            }
        }

        // 2. Update Avatar URL if provided
        if (request.getAvatarUrl() != null) {
            // Can be empty string if clearing avatar
            String avatarUrl = request.getAvatarUrl().trim();
            user.setAvatarUrl(avatarUrl.isEmpty() ? null : avatarUrl);
        }

        userRepository.save(user);

        UserResponse response = new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getAvatarUrl()
        );

        return ResponseEntity.ok(response);
    }
}
