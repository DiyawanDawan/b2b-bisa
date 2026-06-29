-- AlterEnum: add CSV to knowledge source types
ALTER TABLE `knowledge_documents` MODIFY `source_type` ENUM('PDF', 'TXT', 'MD', 'TEXT', 'CSV') NOT NULL;
