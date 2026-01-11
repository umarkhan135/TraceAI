/**
 * Demo Feature for TraceAI Testing
 * This file demonstrates AI-generated code provenance tracking
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export class UserManager {
  private users: Map<string, User> = new Map();

  /**
   * Add a new user to the system
   */
  addUser(user: User): void {
    if (this.users.has(user.id)) {
      throw new Error(`User with id ${user.id} already exists`);
    }
    this.users.set(user.id, user);
  }

  /**
   * Get a user by ID
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Remove a user from the system
   */
  removeUser(id: string): boolean {
    return this.users.delete(id);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Find users by email domain
   */
  findUsersByDomain(domain: string): User[] {
    return this.getAllUsers().filter(user =>
      user.email.endsWith(`@${domain}`)
    );
  }
}

/**
 * Example usage demonstrating the UserManager
 */
export function demoUsage() {
  const manager = new UserManager();

  // Add some test users
  manager.addUser({
    id: '1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    createdAt: new Date('2024-01-01')
  });

  manager.addUser({
    id: '2',
    name: 'Bob Jones',
    email: 'bob@example.com',
    createdAt: new Date('2024-01-15')
  });

  // Query users
  const alice = manager.getUser('1');
  const exampleUsers = manager.findUsersByDomain('example.com');

  console.log('Found users:', exampleUsers);
}
