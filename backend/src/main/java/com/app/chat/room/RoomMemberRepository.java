package com.app.chat.room;

import com.app.chat.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoomMemberRepository extends JpaRepository<RoomMember, Long> {
    List<RoomMember> findByRoom(Room room);
    List<RoomMember> findByUser(User user);
    Optional<RoomMember> findByRoomAndUser(Room room, User user);
    Boolean existsByRoomAndUser(Room room, User user);
}
