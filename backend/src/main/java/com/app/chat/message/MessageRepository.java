package com.app.chat.message;

import com.app.chat.room.Room;
import com.app.chat.room.RetentionPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByRoomOrderBySentAtAsc(Room room);

    @Query("SELECT m FROM Message m JOIN m.room r WHERE r.retentionPolicy = :policy AND m.sentAt < :cutoffTime")
    List<Message> findExpiredMessages(@Param("policy") RetentionPolicy policy, @Param("cutoffTime") LocalDateTime cutoffTime);
}
